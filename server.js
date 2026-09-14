const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configuración de CORS para permitir conexiones desde cualquier origen web de producción
const io = new Server(server, {
    cors: { 
        origin: "*", 
        methods: ["GET", "POST"] 
    }
});

app.use(cors());
app.use(express.json());

// ==========================================
// CONEXIÓN A MONGODB ATLAS
// ==========================================
// Utiliza la variable de entorno del hosting (Render/Railway) o la cadena por defecto con tus credenciales
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://pjaraaguero_db_user:scjrE6omCKg8AqNG@cluster0.uq3iwvj.mongodb.net/sepa_db?appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Conexión exitosa a MongoDB Atlas'))
    .catch(err => console.error('❌ Error de conexión a la Base de Datos:', err));

// ==========================================
// ESQUEMA DE DATOS (OPERACIONES)
// ==========================================
const OperacionSchema = new mongoose.Schema({
    dateKey: { type: String, required: true, unique: true }, // Clave única por día (Ej: "2026-09-14")
    feriado: Boolean,
    supervisorA: String,
    supervisorB: String,
    turnoA: Array,
    turnoB: Array
});

const Operacion = mongoose.model('Operacion', OperacionSchema);

// ==========================================
// RUTAS DE LA API REST
// ==========================================

// Obtener todas las operaciones guardadas para sincronizar el calendario
app.get('/api/v1/operaciones', async (req, res) => {
    try {
        const registros = await Operacion.find({});
        const daysMap = {};
        registros.forEach(r => {
            daysMap[r.dateKey] = {
                feriado: r.feriado,
                supervisorA: r.supervisorA,
                supervisorB: r.supervisorB,
                turnoA: r.turnoA,
                turnoB: r.turnoB
            };
        });
        res.json({ success: true, data: daysMap });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Guardar o actualizar una operación diaria específica (Sincronización en tiempo real)
app.post('/api/v1/operaciones', async (req, res) => {
    try {
        const { data } = req.body; // Recibe el objeto completo con todos los días o cambios
        
        if (!data) {
            return res.status(400).json({ success: false, error: "Faltan los datos a sincronizar" });
        }

        // Iteramos y guardamos/actualizamos cada día modificado en MongoDB
        for (var dateKey in data) {
            var payload = data[dateKey];
            if (!payload || (Object.keys(payload).length === 0)) {
                await Operacion.deleteOne({ dateKey });
            } else {
                await Operacion.findOneAndUpdate(
                    { dateKey },
                    { 
                        feriado: payload.feriado || false,
                        supervisorA: payload.supervisorA || "",
                        supervisorB: payload.supervisorB || "",
                        turnoA: payload.turnoA || [],
                        turnoB: payload.turnoB || []
                    },
                    { upsert: true, new: true }
                );
            }
        }
        
        // PROPAGACIÓN EN TIEMPO REAL: Avisamos a todos los clientes conectados por WebSocket
        io.emit('operacion_actualizada', { timestamp: Date.now() });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==========================================
// WEBSOCKETS (TIEMPO REAL)
// ==========================================
io.on('connection', (socket) => {
    console.log('🔌 Nuevo cliente conectado en tiempo real:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('🔌 Cliente desconectado:', socket.id);
    });
});

// ==========================================
// INICIO DEL SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en puerto ${PORT}`);
});