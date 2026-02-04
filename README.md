🚚 Logistics Dispatch Service

Sistema de gestión logística de paquetes para empresas de despacho.

Permite administrar paquetes, zonas y conductores, con:

Web app para despachadores

API lista para app móvil de conductores

Construido con Node.js + TypeScript + Express y JWT para autenticación.

🗂 Estructura del proyecto
src/
├─ app/ # Configuración principal
├─ controllers/ # Lógica de endpoints
├─ middlewares/ # Auth y roles
├─ models/ # Modelos TypeScript (Package, Driver, User, Zone)
├─ routes/ # Rutas de Express
├─ storage/ # "Base de datos" en memoria
├─ types/ # Tipos compartidos
└─ index.ts # Entrada del servidor

🔑 Funcionalidades actuales
1️⃣ Autenticación (JWT)

Registro y login de usuarios

Roles:

dispatcher → administra todo

driver → ve solo sus paquetes

Contraseñas cifradas con bcrypt

Token JWT expira en 7 días

Endpoints:

Método Ruta Descripción Rol requerido
POST /auth/register Registrar usuario ninguno
POST /auth/login Login y obtener token JWT ninguno
2️⃣ Drivers

Administrar conductores y asignar zonas

Solo accesible a dispatcher

Endpoints:

Método Ruta Descripción Rol
GET /drivers Listar conductores dispatcher
POST /drivers Crear conductor dispatcher
POST /drivers/:id/zones Asignar zonas al conductor dispatcher
3️⃣ Zones

Definición de zonas geográficas para paquetes

Solo accesible a dispatcher

Endpoints:

Método Ruta Descripción Rol
GET /zones Listar zonas dispatcher
POST /zones Crear zona dispatcher
4️⃣ Packages

Gestión de paquetes, asignación a zonas y drivers

Estados: pending, assigned, in_transit, delivered, cancelled

Asignación:

Por zona → driver hereda paquetes de sus zonas

driverId explícito → prioridad sobre zona

Dispatcher:
Método Ruta Descripción
GET /packages Listar todos los paquetes
POST /packages Crear paquete
POST /packages/:id/assign Asignar paquete a driver
GET /packages/driver/:id Listar paquetes de un driver
Driver:
Método Ruta Descripción
GET /packages/me Listar mis paquetes (según driverId o zonas)
PATCH /packages/:id/status Actualizar estado de paquete (solo propios)

Transiciones de estado válidas:

Rol Estados permitidos
Driver pending → assigned → in_transit → delivered
Dispatcher pending → assigned/cancelled
assigned → in_transit/cancelled
in_transit → delivered/cancelled

Protección:

Middleware auth valida token JWT

Middleware requireRole valida rol

Controller valida ownership (driverId) para drivers

5️⃣ Seguridad y roles

Todos los endpoints están protegidos

Los drivers solo acceden a paquetes propios

Los despachadores pueden administrar todo

La seguridad se asegura en backend, no en frontend

🧩 Modelo de datos
// Package
interface Package {
id: string;
trackingCode: string;
zoneId: string;
driverId?: string; // opcional
status: "pending" | "assigned" | "in_transit" | "delivered" | "cancelled";
}

// Driver
interface Driver {
id: string;
name: string;
zoneIds: string[];
}

// Zone
interface Zone {
id: string;
name: string;
}

// User
interface User {
id: string;
username: string;
passwordHash: string;
role: "dispatcher" | "driver";
driverId?: string;
}

⚡ Próximos pasos sugeridos

Preparar app móvil para drivers

Migrar almacenamiento a base de datos real (Postgres + Prisma)

Implementar rutas de entrega y trazabilidad

Agregar logs y auditoría de cambios de estado

🛠 Instalación y ejecución

# instalar dependencias

npm install

# ejecutar en dev

npm run dev

📡 Testeo de API

Se puede usar Postman o Bruno / Thunder Client:

Agregar Authorization: Bearer <token> en headers

Dispatcher prueba /drivers, /zones, /packages

Driver prueba /packages/me y /packages/:id/status
