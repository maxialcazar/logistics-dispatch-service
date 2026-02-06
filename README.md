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
- **Auditoría Total (History)**: Cada acción sobre un paquete queda registrada en un historial inmutable.
- **Vistas de Mapa y Geocodificación**: Seguimiento de paquetes mediante coordenadas GPS y visualización de ETAs.

### 🚲 Perfil de Repartidores (Driver)

- **Seguimiento GPS Real-time**: Ingesta de alta frecuencia y baja latencia (Stateless).
- **Inteligencia de Zonas**: Gestión de paquetes basada en zonas dinámicas.

### 🏠 Portal del Cliente Final (Public)

- **Tracking Premium (SSE)**: Streaming en tiempo real (`/api/public/track/:code/stream`) sin polling.
- **Privacidad Blindada (Masking)**: Enmascaramiento automático de direcciones.
- **Seguridad Anti-Scraping**: Rate limits estrictos.

### 🚀 Capacidades Avanzadas (Production Ready)

- **Arquitectura Event-Driven**: Redis Pub/Sub como backbone de eventos para desacoplar ingesta y consumo.
- **SSE & Websockets Híbridos**: Lo mejor de ambos mundos para cada tipo de cliente.
- **Capa de Caché Inteligente**: Uso de **Redis** con invalidación automática.
- **Resiliencia**: Graceful Shutdown y manejo de errores centralizado.

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

## 📚 Documentación y Recursos

- **Resumen del Producto**: Para una visión comercial y técnica detallada, ver [PRODUCT_OVERVIEW.md](./LDE-INFO/PRODUCT_OVERVIEW.md).
- **Guía de Pruebas**: Para ejecutar tests unitarios y de estrés, consulta la [TESTING_GUIDE.md](./LDE-INFO/TESTING_GUIDE.md).
- **Scripts de Carga**: Disponibles en `LDE-INFO/stress-tests` para validar la escalabilidad.

---

## 🤝 Licencia

Este proyecto está bajo la licencia [ISC](https://opensource.org/licenses/ISC).
