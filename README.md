# Sistema POS Kiosco Damian

Sistema completo de Punto de Venta (POS) para kioscos y comercios pequeños. Desarrollado con React, TypeScript, Tailwind CSS y Supabase.

## Características

- **Gestión de Inventario**: Control completo de productos con alertas de stock bajo
- **Sistema de Ventas**: Interfaz moderna tipo POS para procesamiento rápido de ventas
- **Gestión de Caja**: Control de ingresos y egresos con múltiples métodos de pago
- **Reportes y Estadísticas**: Análisis detallado de ventas con filtros por período
- **Gestión de Turnos**: Control de turnos de trabajo con cálculo automático de totales
- **Diseño Responsive**: Funciona perfectamente en dispositivos móviles, tablets y desktop

## Tecnologías Utilizadas

### Frontend
- **React 18.3.1**: Librería principal para la interfaz de usuario
- **TypeScript 5.5.3**: Tipado estático para mayor seguridad del código
- **Vite 7.2.4**: Build tool y dev server ultra-rápido
- **Tailwind CSS 3.4.18**: Framework CSS utility-first para diseño moderno
- **Lucide React 0.344.0**: Librería de iconos moderna y limpia

### Backend & Database
- **Supabase**: Base de datos PostgreSQL con autenticación y API REST
- **@supabase/supabase-js 2.57.4**: Cliente oficial de Supabase

### Dev Tools
- **ESLint**: Linter para mantener código limpio
- **PostCSS & Autoprefixer**: Procesamiento de CSS

## Estructura del Proyecto

\`\`\`
kiosco-pos/
├── src/
│   ├── components/           # Componentes React
│   │   ├── Dashboard.tsx     # Componente principal con navegación
│   │   ├── Ventas.tsx        # Módulo de ventas (POS)
│   │   ├── Stock.tsx         # Gestión de inventario
│   │   ├── Caja.tsx          # Control de caja
│   │   ├── Reportes.tsx      # Reportes y estadísticas
│   │   └── Configuracion.tsx # Configuración del sistema
│   ├── lib/
│   │   └── supabase.ts       # Cliente y tipos de Supabase
│   ├── App.tsx               # Componente raíz
│   ├── main.tsx              # Punto de entrada
│   └── index.css             # Estilos globales (Tailwind)
├── public/                   # Archivos estáticos
├── supabase/
│   └── migrations/           # Migraciones de base de datos
├── dist/                     # Build de producción
├── .env                      # Variables de entorno
├── db-setup.sql              # Script de configuración de BD
├── package.json              # Dependencias y scripts
├── vite.config.ts            # Configuración de Vite
├── tailwind.config.js        # Configuración de Tailwind
└── tsconfig.json             # Configuración de TypeScript
\`\`\`

## Estructura de la Base de Datos

### Tabla: products
Almacena el inventario de productos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID único del producto |
| code | text | Código único del producto |
| name | text | Nombre del producto |
| description | text | Descripción detallada |
| category | text | Categoría del producto |
| price | numeric | Precio de venta |
| cost | numeric | Costo del producto |
| stock | integer | Cantidad en stock |
| min_stock | integer | Stock mínimo (alertas) |
| active | boolean | Producto activo/inactivo |
| created_at | timestamptz | Fecha de creación |
| updated_at | timestamptz | Fecha de actualización |

### Tabla: sales
Registra todas las ventas realizadas.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID único de la venta |
| sale_number | text | Número de venta (único) |
| date | timestamptz | Fecha y hora de la venta |
| user_id | uuid | ID del usuario vendedor |
| user_name | text | Nombre del vendedor |
| shift_id | uuid | ID del turno |
| items | jsonb | Items vendidos (array JSON) |
| subtotal | numeric | Subtotal de la venta |
| discount | numeric | Descuento aplicado |
| total | numeric | Total final |
| payment_method | text | Método de pago usado |
| created_at | timestamptz | Fecha de creación |

### Tabla: cash_transactions
Registra movimientos de caja (ingresos y egresos).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID único de la transacción |
| shift_id | uuid | ID del turno |
| type | text | Tipo: 'income' o 'expense' |
| category | text | Categoría del movimiento |
| amount | numeric | Monto de la transacción |
| payment_method | text | Método de pago |
| description | text | Descripción detallada |
| created_at | timestamptz | Fecha de creación |

### Tabla: shifts
Controla los turnos de trabajo.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID único del turno |
| user_id | uuid | ID del usuario |
| user_name | text | Nombre del usuario |
| start_date | timestamptz | Fecha/hora de inicio |
| end_date | timestamptz | Fecha/hora de cierre |
| opening_cash | numeric | Efectivo inicial |
| closing_cash | numeric | Efectivo final |
| total_sales | numeric | Total de ventas |
| total_expenses | numeric | Total de egresos |
| active | boolean | Turno activo/cerrado |
| created_at | timestamptz | Fecha de creación |

### Tabla: configuration
Configuración global del sistema.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID único |
| business_name | text | Nombre del negocio |
| address | text | Dirección |
| phone | text | Teléfono |
| tax_id | text | CUIT/RUT |
| currency | text | Símbolo de moneda |
| receipt_message | text | Mensaje en ticket |
| updated_at | timestamptz | Última actualización |

## Instalación y Configuración

### 1. Clonar el Repositorio

\`\`\`bash
git clone <repository-url>
cd kiosco-pos
\`\`\`

### 2. Instalar Dependencias

\`\`\`bash
npm install
\`\`\`

### 3. Configurar Supabase

1. Crea una cuenta en [Supabase](https://supabase.com)
2. Crea un nuevo proyecto
3. Ve a **Settings** → **API** y copia:
   - `Project URL`
   - `anon/public key`

### 4. Configurar Variables de Entorno

Crea un archivo \`.env\` en la raíz del proyecto:

\`\`\`env
VITE_SUPABASE_URL=tu_supabase_url_aqui
VITE_SUPABASE_ANON_KEY=tu_supabase_anon_key_aqui
\`\`\`

### 5. Configurar la Base de Datos

1. Ve a tu proyecto de Supabase
2. Haz clic en **SQL Editor** en el menú lateral
3. Copia el contenido del archivo \`db-setup.sql\`
4. Pégalo en el editor y haz clic en **Run**

Esto creará todas las tablas necesarias con sus políticas de seguridad (RLS) e insertará productos de ejemplo.

### 6. Ejecutar el Proyecto

#### Modo Desarrollo

\`\`\`bash
npm run dev
\`\`\`

La aplicación estará disponible en \`http://localhost:5173\`

#### Build para Producción

\`\`\`bash
npm run build
\`\`\`

Los archivos compilados estarán en el directorio \`dist/\`

#### Preview del Build

\`\`\`bash
npm run preview
\`\`\`

## Módulos del Sistema

### 1. Ventas (POS)
**Ruta**: Dashboard → Ventas

**Funcionalidades**:
- Búsqueda rápida de productos
- Agregar productos al carrito con un clic
- Ajuste de cantidades (+ / -)
- Selección de método de pago (Efectivo, Transferencia, QR, Tarjeta)
- Cálculo automático de totales
- Actualización automática de stock
- Registro de transacciones en caja

**Flujo de Trabajo**:
1. Buscar o seleccionar productos
2. Ajustar cantidades en el carrito
3. Seleccionar método de pago
4. Completar venta
5. El sistema actualiza automáticamente stock y caja

### 2. Inventario (Stock)
**Ruta**: Dashboard → Inventario

**Funcionalidades**:
- Vista de tarjetas con información completa
- Búsqueda por nombre, código o categoría
- Alertas visuales de stock bajo
- Agregar nuevos productos
- Editar productos existentes
- Eliminar productos
- Indicadores de precio, costo y stock

**Datos Requeridos**:
- Código (único)
- Nombre
- Categoría (opcional)
- Precio de venta
- Costo (opcional)
- Stock actual
- Stock mínimo (para alertas)

### 3. Caja
**Ruta**: Dashboard → Caja

**Funcionalidades**:
- Tarjetas con resumen financiero:
  - Ingresos totales (verde)
  - Egresos totales (rojo)
  - Balance (azul)
- Tabla detallada de movimientos
- Agregar ingresos/egresos manuales
- Filtrado por turno activo
- Categorización de movimientos
- Múltiples métodos de pago

**Tipos de Movimientos**:
- **Ingresos**: Ventas (automático), Otros ingresos (manual)
- **Egresos**: Gastos, Pagos a proveedores, etc.

### 4. Reportes
**Ruta**: Dashboard → Reportes

**Funcionalidades**:
- Filtros por período (Hoy, Semana, Mes, Todo)
- Métricas principales:
  - Ventas totales
  - Ticket promedio
  - Items vendidos
  - Tasa de crecimiento
- Análisis por método de pago
- Estadísticas detalladas
- Tabla de últimas 20 ventas
- Visualización de tendencias

**Métricas Calculadas**:
- Total de ventas en $
- Número de transacciones
- Promedio de venta
- Productos más vendidos
- Distribución por método de pago

### 5. Configuración
**Ruta**: Dashboard → Configuración

Módulo preparado para futuras expansiones:
- Datos del negocio
- Configuración de impresora
- Usuarios y permisos
- Backup de datos

## Dependencias Principales

### Production Dependencies

\`\`\`json
{
  "@supabase/supabase-js": "^2.57.4",  // Cliente Supabase
  "lucide-react": "^0.344.0",          // Iconos
  "react": "^18.3.1",                  // UI Library
  "react-dom": "^18.3.1"               // React DOM
}
\`\`\`

### Development Dependencies

\`\`\`json
{
  "@vitejs/plugin-react": "^4.7.0",       // Plugin React para Vite
  "autoprefixer": "^10.4.22",             // PostCSS autoprefixer
  "eslint": "^9.9.1",                     // Linter
  "postcss": "^8.5.6",                    // PostCSS
  "tailwindcss": "^3.4.18",               // CSS Framework
  "typescript": "^5.5.3",                 // TypeScript
  "vite": "^7.2.4"                        // Build tool
}
\`\`\`

## Scripts Disponibles

\`\`\`bash
npm run dev        # Inicia servidor de desarrollo
npm run build      # Genera build de producción
npm run preview    # Preview del build de producción
npm run lint       # Ejecuta el linter
npm run typecheck  # Verifica tipos TypeScript
\`\`\`

## Seguridad

### Row Level Security (RLS)
Todas las tablas tienen habilitado RLS con políticas públicas para operaciones básicas. En un entorno de producción, se recomienda:

1. Implementar autenticación de usuarios
2. Restringir políticas RLS por usuario autenticado
3. Usar variables de entorno para credenciales sensibles
4. Implementar roles y permisos

### Variables de Entorno
Nunca subas el archivo \`.env\` al repositorio. Usa \`.env.example\` para documentar las variables necesarias.

## Personalización

### Colores y Temas
Los colores están definidos en Tailwind CSS. Para cambiarlos, edita \`tailwind.config.js\`:

\`\`\`javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#10b981',  // Emerald
        secondary: '#3b82f6', // Blue
        // ... más colores
      }
    }
  }
}
\`\`\`

### Nombre del Negocio
El nombre "Kiosco Damian" está definido en:
- \`src/components/Dashboard.tsx\` (línea 40)
- Tabla \`configuration\` en la base de datos

## Características Técnicas

### Estado Global
- Gestión de estado con React Hooks (useState, useEffect)
- Prop drilling para datos del turno activo
- Estado local en cada componente

### Optimizaciones
- Build optimizado con Vite
- Code splitting automático
- Minificación de CSS y JS
- Imágenes y assets optimizados

### Responsive Design
- Mobile-first approach
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Grid system flexible de Tailwind

## Solución de Problemas

### No se muestran los productos
1. Verifica que ejecutaste el script \`db-setup.sql\`
2. Revisa las credenciales en \`.env\`
3. Verifica la conexión a internet
4. Revisa la consola del navegador para errores

### Error de conexión a Supabase
1. Verifica que las variables de entorno estén correctas
2. Asegúrate que el proyecto de Supabase esté activo
3. Revisa que la API key sea la correcta (anon/public)

### Error al compilar
1. Elimina \`node_modules\` y ejecuta \`npm install\`
2. Verifica la versión de Node (se recomienda 18+)
3. Limpia la caché de Vite: \`npm run build -- --force\`

## Próximas Características

- [ ] Sistema de autenticación de usuarios
- [ ] Impresión de tickets/facturas
- [ ] Exportación de reportes a PDF/Excel
- [ ] Gráficos interactivos
- [ ] Gestión de proveedores
- [ ] Sistema de fidelización de clientes
- [ ] Modo offline con sincronización
- [ ] App móvil nativa
- [ ] Integración con MercadoPago/Stripe

## Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (\`git checkout -b feature/NuevaCaracteristica\`)
3. Commit tus cambios (\`git commit -m 'Agregar nueva característica'\`)
4. Push a la rama (\`git push origin feature/NuevaCaracteristica\`)
5. Abre un Pull Request

## Licencia

Este proyecto es de código abierto y está disponible bajo la licencia MIT.

## Autor

Sistema desarrollado para Kiosco Damian

## Soporte

Para reportar bugs o solicitar nuevas características, abre un issue en el repositorio.

---

**Versión**: 1.0.0
**Última actualización**: Noviembre 2024
