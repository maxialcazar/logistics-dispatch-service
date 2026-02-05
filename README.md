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

- **Gestión Integral**: Usuarios, Zonas, Conductores y Paquetes.
- **Validación de Datos**: Esquemas estrictos con **Zod** para prevenir datos corruptos.
- **Paginación y Búsqueda**: Navegación eficiente por grandes volúmenes de datos.
- **Documentación Viva**: API documentada con **Swagger** en `/api-docs`.

### 🚲 Perfil de Repartidores (Driver)

- **Vista Especializada**: Acceso exclusivo a los paquetes de su zona asignada.
- **Flujo de Entrega**: Reglas de negocio para cambios de estado (ej: no se puede "entregar" un paquete "cancelado").
- **Alta Disponibilidad**: Capa de caché con **Redis** para consultas ultrarrápidas de zonas y perfiles.

### 🛡️ Core Arquitectónico

- **Capa de Servicios**: Lógica de negocio desacoplada para máxima escalabilidad.
- **Seguridad Avanzada**: Protección con **Helmet**, **Rate Limiting** y **Bcrypt**.
- **Logging Estructurado**: Registro de eventos y errores con **Winston**.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js (v18+)
- **Lenguaje**: TypeScript
- **Framework**: Express.js
- **Base de Datos**: PostgreSQL + **Redis** (Caché)
- **ORM**: Prisma (v7+)
- **Validación**: Zod
- **Autenticación**: JWT
- **Pruebas**: Jest + Supertest
- **Logging**: Winston + Morgan

---

## 📁 Estructura del Proyecto

```text
src/
├── controllers/    # Controladores de entrada (req/res)
├── services/       # Lógica de negocio pura (Servicios)
├── middlewares/    # Auth, Roles, Validación, Error Handler
├── routes/         # Definición de endpoints
├── schemas/        # Esquemas de validación Zod
├── utils/          # Helpers (Logger, etc.)
├── redis.ts        # Cliente de caché
├── prisma.ts       # Cliente de base de datos
└── app.ts          # Configuración de Express
```

---

## 📡 API Reference & Swagger

El servidor cuenta con documentación interactiva:

- **Swagger UI**: [http://localhost:3001/api-docs](http://localhost:3001/api-docs)
- **Health Check**: `/api/health`

Para una guía detallada de cómo probar cada endpoint y correr los tests automatizados, consulta nuestra [**Guía de Pruebas (TESTING_GUIDE.md)**](./TESTING_GUIDE.md).

---

## 🤝 Contribución

Las contribuciones son bienvenidas. Por favor, abre un _issue_ primero para discutir los cambios que deseas realizar.

---

## � Licencia

Este proyecto está bajo la licencia [ISC](https://opensource.org/licenses/ISC).
