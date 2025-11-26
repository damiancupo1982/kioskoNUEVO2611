import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const DATA_DIR = join(__dirname, 'data');

const ensureDataDir = async () => {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
};

const readJSON = async (filename) => {
  try {
    const data = await fs.readFile(join(DATA_DIR, filename), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
};

const writeJSON = async (filename, data) => {
  await fs.writeFile(join(DATA_DIR, filename), JSON.stringify(data, null, 2));
};

const initializeData = async () => {
  await ensureDataDir();

  const usuarios = await readJSON('usuarios.json');
  if (!usuarios) {
    await writeJSON('usuarios.json', {
      usuarios: [
        {
          id: '1',
          username: 'admin',
          password: 'admin',
          nombre: 'Administrador',
          rol: 'administrador'
        },
        {
          id: '2',
          username: 'vendedor',
          password: 'vendedor',
          nombre: 'Vendedor',
          rol: 'vendedor'
        }
      ]
    });
  }

  const stock = await readJSON('stock.json');
  if (!stock) {
    await writeJSON('stock.json', { productos: [] });
  }

  const ventas = await readJSON('ventas.json');
  if (!ventas) {
    await writeJSON('ventas.json', { ventas: [] });
  }

  const caja = await readJSON('caja.json');
  if (!caja) {
    await writeJSON('caja.json', { movimientos: [] });
  }

  const turnos = await readJSON('turnos.json');
  if (!turnos) {
    await writeJSON('turnos.json', { turnos: [] });
  }

  const config = await readJSON('configuracion.json');
  if (!config) {
    await writeJSON('configuracion.json', {
      nombreNegocio: 'Mi Kiosco'
    });
  }
};

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const data = await readJSON('usuarios.json');

  const usuario = data.usuarios.find(
    u => u.username === username && u.password === password
  );

  if (usuario) {
    const { password: _, ...usuarioSinPassword } = usuario;
    res.json({ success: true, usuario: usuarioSinPassword });
  } else {
    res.json({ success: false });
  }
});

app.post('/api/turnos/iniciar', async (req, res) => {
  const { usuarioId, usuarioNombre } = req.body;
  const data = await readJSON('turnos.json');

  const turnoActivo = data.turnos.find(t => t.usuarioId === usuarioId && t.activo);

  if (turnoActivo) {
    return res.json({ success: true, turno: turnoActivo });
  }

  const nuevoTurno = {
    id: Date.now().toString(),
    usuarioId,
    usuarioNombre,
    fechaInicio: new Date().toISOString(),
    fechaFin: null,
    recaudacion: {
      efectivo: 0,
      transferencia: 0,
      qr: 0,
      expensas: 0
    },
    gastos: 0,
    activo: true
  };

  data.turnos.push(nuevoTurno);
  await writeJSON('turnos.json', data);

  res.json({ success: true, turno: nuevoTurno });
});

app.post('/api/turnos/finalizar', async (req, res) => {
  const { turnoId } = req.body;
  const data = await readJSON('turnos.json');

  const turno = data.turnos.find(t => t.id === turnoId);
  if (turno) {
    turno.activo = false;
    turno.fechaFin = new Date().toISOString();
    await writeJSON('turnos.json', data);
  }

  res.json({ success: true });
});

app.get('/api/stock', async (req, res) => {
  const data = await readJSON('stock.json');
  res.json(data);
});

app.post('/api/stock', async (req, res) => {
  const data = await readJSON('stock.json');
  const nuevoProducto = {
    id: Date.now().toString(),
    ...req.body
  };
  data.productos.push(nuevoProducto);
  await writeJSON('stock.json', data);
  res.json({ success: true, producto: nuevoProducto });
});

app.put('/api/stock/:id', async (req, res) => {
  const data = await readJSON('stock.json');
  const index = data.productos.findIndex(p => p.id === req.params.id);

  if (index !== -1) {
    data.productos[index] = { ...data.productos[index], ...req.body };
    await writeJSON('stock.json', data);
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

app.delete('/api/stock/:id', async (req, res) => {
  const data = await readJSON('stock.json');
  data.productos = data.productos.filter(p => p.id !== req.params.id);
  await writeJSON('stock.json', data);
  res.json({ success: true });
});

app.post('/api/ventas', async (req, res) => {
  const venta = {
    id: Date.now().toString(),
    fecha: new Date().toISOString(),
    ...req.body
  };

  const ventasData = await readJSON('ventas.json');
  ventasData.ventas.push(venta);
  await writeJSON('ventas.json', ventasData);

  const stockData = await readJSON('stock.json');
  venta.productos.forEach(itemVenta => {
    const producto = stockData.productos.find(p => p.id === itemVenta.id);
    if (producto) {
      producto.cantidad -= itemVenta.cantidad;
    }
  });
  await writeJSON('stock.json', stockData);

  const cajaData = await readJSON('caja.json');
  cajaData.movimientos.push({
    id: Date.now().toString(),
    tipo: 'ingreso',
    concepto: 'Venta',
    monto: venta.total,
    metodoPago: venta.metodoPago,
    fecha: new Date().toISOString(),
    usuarioId: venta.usuarioId
  });
  await writeJSON('caja.json', cajaData);

  const turnosData = await readJSON('turnos.json');
  const turnoActivo = turnosData.turnos.find(t => t.usuarioId === venta.usuarioId && t.activo);
  if (turnoActivo) {
    turnoActivo.recaudacion[venta.metodoPago] += venta.total;
    await writeJSON('turnos.json', turnosData);
  }

  res.json({ success: true, venta });
});

app.get('/api/ventas', async (req, res) => {
  const data = await readJSON('ventas.json');
  res.json(data);
});

app.post('/api/caja/gasto', async (req, res) => {
  const data = await readJSON('caja.json');
  const gasto = {
    id: Date.now().toString(),
    tipo: 'gasto',
    fecha: new Date().toISOString(),
    ...req.body
  };
  data.movimientos.push(gasto);
  await writeJSON('caja.json', data);

  const turnosData = await readJSON('turnos.json');
  const turnoActivo = turnosData.turnos.find(t => t.usuarioId === req.body.usuarioId && t.activo);
  if (turnoActivo) {
    turnoActivo.gastos += req.body.monto;
    await writeJSON('turnos.json', turnosData);
  }

  res.json({ success: true, gasto });
});

app.get('/api/caja', async (req, res) => {
  const data = await readJSON('caja.json');
  res.json(data);
});

app.get('/api/turnos', async (req, res) => {
  const data = await readJSON('turnos.json');
  res.json(data);
});

app.get('/api/configuracion', async (req, res) => {
  const data = await readJSON('configuracion.json');
  res.json(data);
});

app.put('/api/configuracion', async (req, res) => {
  await writeJSON('configuracion.json', req.body);
  res.json({ success: true });
});

app.get('/api/usuarios', async (req, res) => {
  const data = await readJSON('usuarios.json');
  res.json(data);
});

app.post('/api/usuarios', async (req, res) => {
  const data = await readJSON('usuarios.json');
  const nuevoUsuario = {
    id: Date.now().toString(),
    ...req.body
  };
  data.usuarios.push(nuevoUsuario);
  await writeJSON('usuarios.json', data);
  res.json({ success: true, usuario: nuevoUsuario });
});

app.put('/api/usuarios/:id', async (req, res) => {
  const data = await readJSON('usuarios.json');
  const index = data.usuarios.findIndex(u => u.id === req.params.id);

  if (index !== -1) {
    data.usuarios[index] = { ...data.usuarios[index], ...req.body };
    await writeJSON('usuarios.json', data);
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  const data = await readJSON('usuarios.json');
  data.usuarios = data.usuarios.filter(u => u.id !== req.params.id);
  await writeJSON('usuarios.json', data);
  res.json({ success: true });
});

app.get('/api/backup', async (req, res) => {
  const backup = {
    usuarios: await readJSON('usuarios.json'),
    stock: await readJSON('stock.json'),
    ventas: await readJSON('ventas.json'),
    caja: await readJSON('caja.json'),
    turnos: await readJSON('turnos.json'),
    configuracion: await readJSON('configuracion.json'),
    fecha: new Date().toISOString()
  };
  res.json(backup);
});

await initializeData();

app.listen(PORT, () => {
  console.log(`Servidor API corriendo en http://localhost:${PORT}`);
});
