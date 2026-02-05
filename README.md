# 🚚 Logistics Dispatch Service

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)

**Logistics Dispatch Service** es un backend de grado de producción diseñado para la gestión crítica de despacho y entrega de paquetes. Implementa una arquitectura robusta orientada a servicios, optimizada para alta disponibilidad y trazabilidad total.

---

## ✨ Características Principales

### 👨‍💼 Panel de Despachadores (Dispatcher)

- **Gestión Integral**: Control total sobre Usuarios, Zonas, Conductores y Paquetes.
- **Auditoría Total (History)**: Cada acción sobre un paquete queda registrada en un historial inmutable, permitiendo saber quién hizo qué y cuándo.
- **Paginación y Filtrado**: Endpoints optimizados para manejar miles de registros sin degradación de performance.

### 🚲 Perfil de Repartidores (Driver)

- **Inteligencia de Zonas**: Los conductores solo ven y gestionan paquetes asignados a sus zonas dinámicas.
- **Seguridad de Estado**: Máquina de estados estricta que previene transiciones de entrega inválidas.
- **Notificaciones Real-time**: Recibe actualizaciones instantáneas de asignación a través de WebSockets.

### 🚀 Capacidades Avanzadas (Production Ready)

- **Arquitectura Reactiva**: Integración con **Socket.io** para emitir eventos en tiempo real (`package-status-updated`, `package-assigned`, etc.).
- **Capa de Caché Inteligente**: Uso proactivo de **Redis** para acelerar lecturas, con invalidación automática basada en eventos.
- **Resiliencia y Cierre Limpio**: Implementación de **Graceful Shutdown** para proteger conexiones a base de datos y caché durante despliegues.
- **Performance**: Base de datos indexada en campos críticos (status, IDs) para búsquedas instantáneas.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js (v18+)
- **Lenguaje**: TypeScript
- **Database**: PostgreSQL (Prisma ORM v7+)
- **Caching**: Redis
- **Real-time**: Socket.io
- **Security**: Helmet, Express Rate Limit, Bcrypt, JWT.
- **Logging**: Winston (Structured Logs) + Morgan.

---

## 📁 Estructura del Proyecto

```text
src/
├── controllers/    # Parseo de entrada y respuesta HTTP
├── services/       # Capa de Lógica de Negocio (Business logic)
├── middlewares/    # Seguridad, Roles y Validación
├── routes/         # Definición de rutas y OpenAPI docs
├── schemas/        # Esquemas de validación (Zod)
├── utils/          # Logger (Winston) y Helpers
├── websocket.ts    # Gestor de eventos en tiempo real
├── redis.ts        # Wrapper de cliente Redis
├── prisma.ts       # Configuración de Prisma Client
└── index.ts        # Entry point con Graceful Shutdown
```

---

## 📡 Referencia de API & Eventos

### API Documentada

Accede a la documentación interactiva en: [http://localhost:3001/api-docs](http://localhost:3001/api-docs).

### Eventos WebSocket (Socket.io)

El servidor emite los siguientes eventos globales:

- `package-created`: Notifica la creación de un nuevo paquete.
- `package-status-updated`: Actualización de estado en vivo.
- `package-assigned`: Cuando un paquete es vinculado a un conductor.
- `zones-reassigned`: Cambio en la configuración de zonas de un conductor.

---

## 🧪 Pruebas y Monitoreo

Para detalles sobre cómo ejecutar tests automatizados con **Jest** o cómo inspeccionar los logs estructurados, consulta la [**Guía de Pruebas (TESTING_GUIDE.md)**](./TESTING_GUIDE.md).

---

## 🤝 Licencia

Este proyecto está bajo la licencia [ISC](https://opensource.org/licenses/ISC).
