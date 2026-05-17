const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors({
  origin: '*', // Allow connections from all Capacitor mobile hosts and Vite clients
  methods: ['GET', 'POST']
}));

// Basic status check
app.get('/health', (req, res) => {
  res.json({ status: 'ONLINE', clients: io.engine.clientsCount });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e7 // Increase buffer size to 10MB to accommodate recorded WebM voice files easily
});

// Map to track active bands of connected operatives
const operativeBands = new Map();

io.on('connection', (socket) => {
  console.log(`[SECURE BRIDGE] Operative connected (Socket ID: ${socket.id})`);

  // Operative requests to join a specific radio channel
  socket.on('join-radio-band', ({ operativeId, band }) => {
    // Leave previous band rooms if any
    const oldBand = operativeBands.get(socket.id);
    if (oldBand) {
      socket.leave(oldBand);
      console.log(`[BRIDGE] Operative ${operativeId || socket.id} left band room: ${oldBand}`);
    }

    // Join new band room
    socket.join(band);
    operativeBands.set(socket.id, band);
    console.log(`[BRIDGE] Operative ${operativeId || 'OP-UNKNOWN'} connected to band room: ${band}`);

    // Broadcast system log to the channel
    socket.to(band).emit('system-status', {
      text: `📡 System Alert: Operative ${operativeId || 'OP-UNKNOWN'} has synced connection to the band.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Broadcast text incident report / tactical updates
  socket.on('send-text-log', ({ text, sender, senderClass, avatar, band, deviceType, photo }) => {
    console.log(`[LOG-BROADCAST] From ${sender} in ${band}: "${text || '[PHOTO]'}" (Device: ${deviceType})`);
    
    // Broadcast to other operatives tuned in the same band
    socket.to(band).emit('text-log-received', {
      id: `reply-${Date.now()}`,
      sender,
      senderClass,
      avatar,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      deviceType,
      photo
    });
  });

  // Broadcast high-fidelity binary voice transmission
  socket.on('send-voice-transmission', ({ audioData, sender, senderClass, avatar, duration, channel, text, band, deviceType, mimeType }) => {
    console.log(`[VOICE-BROADCAST] From ${sender} in ${band} (Length: ${duration}s, Transcript: "${text.substring(0, 30)}...", Device: ${deviceType}, Mime: ${mimeType})`);

    // Broadcast binary arraybuffer data and text metadata to other operatives in room
    socket.to(band).emit('voice-transmission-received', {
      id: `voice-${Date.now()}`,
      sender,
      senderClass,
      avatar,
      duration,
      channel,
      text,
      audioData, // This transfers the raw recorded WebM voice data!
      deviceType,
      mimeType
    });
  });

  socket.on('disconnect', () => {
    const band = operativeBands.get(socket.id);
    operativeBands.delete(socket.id);
    console.log(`[SECURE BRIDGE] Operative disconnected (Socket ID: ${socket.id})`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n======================================================');
  console.log(`[SECURE BRIDGE] RAD-COM network online on port ${PORT}`);
  console.log(`📡 Local server URL: http://localhost:${PORT}`);
  console.log('======================================================\n');
});
