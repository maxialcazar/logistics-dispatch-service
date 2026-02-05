# 🚚 Logistics Dispatch Service

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)

**Logistics Dispatch Service** es un potente backend diseñado para gestionar la logística de despacho y entrega de paquetes. Permite una coordinación fluida entre despachadores y repartidores a través de un sistema de roles robusto y una arquitectura escalable.

---

## ✨ Características Principales

### 👨‍💼 Panel de Despachadores (Dispatcher)

- **Gestión de Usuarios**: Crear y administrar cuentas de administradores y repartidores.
- **Control de Zonas**: Definir áreas geográficas de operación.
- **Administración de Drivers**: Asignar repartidores a zonas específicas.
- **Logística de Paquetes**: Crear paquetes, asignarlos a zonas y monitorear su estado global.

### 🚲 Perfil de Repartidores (Driver)

- **Vista Personalizada**: Acceso exclusivo a zonas y paquetes asignados.
- **Gestión de Entregas**: Actualización de estados de paquetes en tiempo real (`in_transit` → `delivered`).
- **Seguridad Garantizada**: Los repartidores solo tienen acceso a la información que les compete.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js (v18+)
- **Lenguaje**: TypeScript
- **Framework**: Express.js
- **Base de Datos**: PostgreSQL
- **ORM**: Prisma (v7+)
- **Autenticación**: JSON Web Tokens (JWT)
- **Seguridad**: Bcrypt para hashing de contraseñas

---

## 📊 Modelo de Datos

```mermaid
erDiagram
    USER ||--o| DRIVER : "is a"
    DRIVER ||--o{ ZONE : "manages"
    ZONE ||--o{ PACKAGE : "contains"
    USER {
        string id PK
        string username
        string password
        enum role
    }
    DRIVER {
        string id PK
        string name
    }
    ZONE {
        string id PK
        string name
    }
    PACKAGE {
        string id PK
        string trackingCode
        string status
    }
```

---

## 🚀 Instalación y Configuración

### 1. Clonar y preparar dependencias

```bash
git clone <repo-url>
cd logistics-dispatch-service
npm install
```

### 2. Variables de Entorno

Crea un archivo `.env` en la raíz con la siguiente configuración:

```env
PORT=3001
DATABASE_URL="postgresql://USUARIO:PASSWORD@localhost:5432/TU_DB"
JWT_SECRET="tu_secreto_super_seguro"
JWT_EXPIRES_IN="24h"
```

### 3. Base de Datos y Cliente Prisma

```bash
# Sincronizar esquema y generar cliente
npx prisma generate
npx prisma migrate dev --name init

# Opcional: Poblar base de datos con admin inicial (admin/1234)
npx prisma db seed
```

---

## 📁 Estructura del Proyecto

```text
src/
├── controllers/    # Lógica de negocio por entidad
├── middlewares/    # Auth (JWT) y validación de Roles
├── routes/         # Definición de rutas Express
├── prisma.ts       # Configuración del cliente Prisma
└── index.ts        # Punto de entrada del servidor
```

---

## 📡 API Reference

Para una guía detallada de cómo probar cada endpoint, consulta nuestra [**Guía de Pruebas API**](./Testing%20Guide).

| Método  | Endpoint                   | Acceso     | Descripción                  |
| :------ | :------------------------- | :--------- | :--------------------------- |
| `POST`  | `/api/auth/login`          | Público    | Obtener JWT Token            |
| `POST`  | `/api/users`               | Dispatcher | Crear nuevos usuarios        |
| `GET`   | `/api/zones`               | Dispatcher | Listar zonas operativas      |
| `GET`   | `/api/drivers`             | Dispatcher | Ver lista de conductores     |
| `PATCH` | `/api/packages/:id/status` | Mix        | Actualizar estado de entrega |
| `GET`   | `/api/packages/me`         | Driver     | Ver paquetes del repartidor  |

---

## 🤝 Contribución

Las contribuciones son bienvenidas. Por favor, abre un _issue_ primero para discutir los cambios que deseas realizar.

---

## � Licencia

Este proyecto está bajo la licencia [ISC](https://opensource.org/licenses/ISC).
