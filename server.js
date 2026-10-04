const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());

const conexion = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Moises7304",
  database: process.env.DB_NAME || "cocina_escolar",
  port: process.env.DB_PORT || 3306,
});

conexion.connect((err) => {
  if (err) console.log("Error de conexión:", err);
  else console.log("Conectado a MySQL");
});

// ==========================================
// Registrar retiro (acepta carnet O estudiante_id)
// ==========================================
app.post("/retiro", (req, res) => {
  const { estudiante_id, carnet, utensilio_id } = req.body;

  if (!utensilio_id) {
    return res.json({ status: "error", mensaje: "Falta utensilio_id" });
  }

  if (carnet) {
    const buscarSQL = "SELECT id FROM estudiantes WHERE carnet = ? OR codigo_barra = ?";
    conexion.query(buscarSQL, [carnet, carnet], (err, resultados) => {
      if (err) return res.json({ status: "error", mensaje: err });
      if (resultados.length === 0) {
        return res.json({ status: "error", mensaje: "Estudiante no encontrado" });
      }
      const idEstudiante = resultados[0].id;
      insertarMovimiento(idEstudiante, utensilio_id, res);
    });
  } else if (estudiante_id) {
    insertarMovimiento(estudiante_id, utensilio_id, res);
  } else {
    return res.json({ status: "error", mensaje: "Falta carnet o estudiante_id" });
  }
});

function insertarMovimiento(estudianteId, utensilioId, res) {
  const sql = "INSERT INTO movimientos (estudiante_id, utensilio_id, fecha_retiro) VALUES (?, ?, NOW())";
  conexion.query(sql, [estudianteId, utensilioId], (err) => {
    if (err) return res.json({ status: "error", mensaje: err });
    res.json({ status: "ok", mensaje: "Retiro registrado" });
  });
}

// ==========================================
// Registrar devolución individual
// ==========================================
app.put("/devolucion/:id", (req, res) => {
  const sql = "UPDATE movimientos SET fecha_devolucion = NOW() WHERE id = ?";
  conexion.query(sql, [req.params.id], (err, resultado) => {
    if (err) return res.json({ status: "error", mensaje: err });
    if (resultado.affectedRows === 0) {
      return res.json({ status: "error", mensaje: "Movimiento no encontrado" });
    }
    res.json({ status: "ok", mensaje: "Devolución registrada" });
  });
});

// ==========================================
// Registrar devolución masiva por carnet
// ==========================================
app.put("/devolucionCarnet/:carnet", (req, res) => {
  const carnet = req.params.carnet;

  const buscarSQL = `
    SELECT m.id 
    FROM movimientos m
    JOIN estudiantes e ON m.estudiante_id = e.id
    WHERE (e.carnet = ? OR e.codigo_barra = ?) 
      AND m.fecha_devolucion IS NULL
  `;

  conexion.query(buscarSQL, [carnet, carnet], (err, resultados) => {
    if (err) return res.json({ status: "error", mensaje: err });

    if (resultados.length === 0) {
      return res.json({
        status: "error",
        mensaje: "El estudiante no tiene utensilios pendientes"
      });
    }

    const updateSQL = `
      UPDATE movimientos m
      JOIN estudiantes e ON m.estudiante_id = e.id
      SET m.fecha_devolucion = NOW()
      WHERE (e.carnet = ? OR e.codigo_barra = ?) 
        AND m.fecha_devolucion IS NULL
    `;

    conexion.query(updateSQL, [carnet, carnet], (err2, resultado) => {
      if (err2) return res.json({ status: "error", mensaje: err2 });

      res.json({
        status: "ok",
        mensaje: "Devoluciones registradas",
        cantidad: resultado.affectedRows
      });
    });
  });
});

// ==========================================
// Informe diario (HOY)
// ==========================================
app.get("/informe", (req, res) => {
  const sql = `
    SELECT u.tipo, COUNT(*) AS entregados
    FROM movimientos m
    JOIN utensilios u ON m.utensilio_id = u.id
    WHERE DATE(m.fecha_retiro) = CURDATE()
    GROUP BY u.tipo
  `;
  conexion.query(sql, (err, resultados) => {
    if (err) return res.json({ status: "error", mensaje: err });
    res.json(resultados);
  });
});

// ==========================================
// Informe histórico por fecha (YYYY-MM-DD)
// ==========================================
app.get("/informe/:fecha", (req, res) => {
  const fecha = req.params.fecha;
  const sql = `
    SELECT u.tipo, COUNT(*) AS entregados
    FROM movimientos m
    JOIN utensilios u ON m.utensilio_id = u.id
    WHERE DATE(m.fecha_retiro) = ?
    GROUP BY u.tipo
  `;
  conexion.query(sql, [fecha], (err, resultados) => {
    if (err) return res.json({ status: "error", mensaje: err });
    res.json(resultados);
  });
});

// ==========================================
// Listar movimientos con detalles
// ==========================================
app.get("/movimientos", (req, res) => {
  const sql = `
    SELECT 
      m.id,
      e.nombre AS estudiante,
      e.carnet,
      u.tipo AS utensilio,
      m.fecha_retiro,
      m.fecha_devolucion
    FROM movimientos m
    JOIN estudiantes e ON m.estudiante_id = e.id
    JOIN utensilios u ON m.utensilio_id = u.id
    ORDER BY m.fecha_retiro DESC
  `;
  conexion.query(sql, (err, resultados) => {
    if (err) return res.json({ status: "error", mensaje: err });
    res.json(resultados);
  });
});

// ==========================================
// Consultar utensilios pendientes por carnet
// ==========================================
app.get("/pendientes/:carnet", (req, res) => {
  const carnet = req.params.carnet;
  const sql = `
    SELECT 
      m.id AS movimiento_id,
      u.tipo,
      m.fecha_retiro
    FROM movimientos m
    JOIN estudiantes e ON m.estudiante_id = e.id
    JOIN utensilios u ON m.utensilio_id = u.id
    WHERE (e.carnet = ? OR e.codigo_barra = ?) 
      AND m.fecha_devolucion IS NULL
    ORDER BY m.fecha_retiro DESC
  `;
  conexion.query(sql, [carnet, carnet], (err, resultados) => {
    if (err) return res.json({ status: "error", mensaje: err });
    res.json(resultados);
  });
});

// ==========================================
// Buscar estudiante por carnet
// ==========================================
app.get("/estudiante/:carnet", (req, res) => {
  const carnet = req.params.carnet;
  const sql = "SELECT id, nombre, carnet, codigo_barra FROM estudiantes WHERE carnet = ? OR codigo_barra = ?";
  conexion.query(sql, [carnet, carnet], (err, resultados) => {
    if (err) return res.json({ status: "error", mensaje: err });
    if (resultados.length === 0) {
      return res.json({ status: "error", mensaje: "Estudiante no encontrado" });
    }
    res.json(resultados[0]);
  });
});

// ==========================================
// GUÍA 11: CRUD DE UTENSILIOS
// ==========================================

// LISTAR todos los utensilios activos
app.get("/utensilios", (req, res) => {
  const sql = "SELECT id, tipo, cantidad FROM utensilios WHERE activo = 1 ORDER BY id ASC";
  conexion.query(sql, (err, resultados) => {
    if (err) return res.json({ status: "error", mensaje: err });
    res.json(resultados);
  });
});

// CREAR un utensilio
app.post("/utensilios", (req, res) => {
  const { tipo, cantidad } = req.body;
  if (!tipo || cantidad === undefined) {
    return res.json({ status: "error", mensaje: "Faltan datos" });
  }
  const sql = "INSERT INTO utensilios (tipo, cantidad, activo) VALUES (?, ?, 1)";
  conexion.query(sql, [tipo, cantidad], (err, resultado) => {
    if (err) return res.json({ status: "error", mensaje: err });
    res.json({
      status: "ok",
      mensaje: "Utensilio agregado",
      id: resultado.insertId,
    });
  });
});

// ACTUALIZAR un utensilio
app.put("/utensilios/:id", (req, res) => {
  const { tipo, cantidad } = req.body;
  const id = req.params.id;
  if (!tipo || cantidad === undefined) {
    return res.json({ status: "error", mensaje: "Faltan datos" });
  }
  const sql = "UPDATE utensilios SET tipo = ?, cantidad = ? WHERE id = ?";
  conexion.query(sql, [tipo, cantidad, id], (err, resultado) => {
    if (err) return res.json({ status: "error", mensaje: err });
    if (resultado.affectedRows === 0) {
      return res.json({ status: "error", mensaje: "Utensilio no encontrado" });
    }
    res.json({ status: "ok", mensaje: "Utensilio actualizado" });
  });
});

// ELIMINAR un utensilio (marcar como inactivo)
app.delete("/utensilios/:id", (req, res) => {
  const id = req.params.id;
  const sql = "UPDATE utensilios SET activo = 0 WHERE id = ?";
  conexion.query(sql, [id], (err, resultado) => {
    if (err) return res.json({ status: "error", mensaje: err });
    if (resultado.affectedRows === 0) {
      return res.json({ status: "error", mensaje: "Utensilio no encontrado" });
    }
    res.json({ status: "ok", mensaje: "Utensilio eliminado" });
  });
});

// ==========================================
// GUÍA 12: DASHBOARD con disponibles calculados
// ==========================================
app.get("/dashboard", (req, res) => {
  const sql = `
    SELECT 
      u.id,
      u.tipo,
      u.cantidad AS cantidad_total,
      COALESCE(p.pendientes, 0) AS pendientes,
      (u.cantidad - COALESCE(p.pendientes, 0)) AS disponibles
    FROM utensilios u
    LEFT JOIN (
      SELECT utensilio_id, COUNT(*) AS pendientes
      FROM movimientos
      WHERE fecha_devolucion IS NULL
      GROUP BY utensilio_id
    ) p ON u.id = p.utensilio_id
    WHERE u.activo = 1
    ORDER BY u.id ASC
  `;
  conexion.query(sql, (err, resultados) => {
    if (err) return res.json({ status: "error", mensaje: err });
    res.json(resultados);
  });
});

// ==========================================
// Iniciar servidor
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});