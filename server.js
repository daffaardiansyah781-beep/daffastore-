const express = require('express');
const cors    = require('cors');
const midtrans = require('midtrans-client');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// Inisialisasi Midtrans
const snap = new midtrans.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY || '',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || ''
});

// Simpan order sementara di memory
const orders = {};

// Health check
app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: 'DaffaStore API berjalan! ✅',
    version: '1.0.0'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'OK' });
});

// Verifikasi akun game
app.post('/api/topup/verify', (req, res) => {
  const { userId } = req.body;
  if (!userId || userId.length < 3) {
    return res.status(400).json({ success: false, message: 'User ID tidak valid' });
  }
  const nicks = ['ShadowWarrior','DragonSlayer','NightHunter','StarBreaker'];
  res.json({ 
    success: true, 
    nickname: nicks[Math.floor(Math.random()*nicks.length)],
    userId 
  });
});

// Buat transaksi Midtrans
app.post('/api/payment/create', async (req, res) => {
  try {
    const { gameId, nominalId, userId, email, amount, gameName, itemName } = req.body;
    if (!userId || !email || !amount) {
      return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
    }

    const orderId = `DS-${Date.now()}-${uuidv4().slice(0,6).toUpperCase()}`;
    
    // Simpan order
    orders[orderId] = { orderId, gameId, userId, email, amount, gameName, itemName, status: 'PENDING', createdAt: new Date() };

    // Jika Midtrans belum dikonfigurasi, return simulasi
    if (!process.env.MIDTRANS_SERVER_KEY) {
      return res.json({ success: true, orderId, snapToken: 'SANDBOX_TOKEN', simulated: true });
    }

    const parameter = {
      transaction_details: { order_id: orderId, gross_amount: amount },
      customer_details: { email },
      item_details: [{ id: nominalId, name: itemName || gameName, price: amount, quantity: 1 }]
    };

    const token = await snap.createTransactionToken(parameter);
    res.json({ success: true, orderId, snapToken: token, clientKey: process.env.MIDTRANS_CLIENT_KEY });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cek status order
app.get('/api/orders/:id', (req, res) => {
  const order = orders[req.params.id];
  if (!order) return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
  res.json({ success: true, data: order });
});

// Webhook Midtrans
app.post('/api/webhook/midtrans', (req, res) => {
  const { order_id, transaction_status } = req.body;
  if (orders[order_id]) {
    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      orders[order_id].status = 'SUCCESS';
    } else if (['cancel','expire','deny'].includes(transaction_status)) {
      orders[order_id].status = 'FAILED';
    }
  }
  res.json({ message: 'OK' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 DaffaStore API jalan di port ${PORT}`));

module.exports = app;
