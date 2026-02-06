# � Logistics Dispatch Service (LDE)

![Build Status](https://img.shields.io/badge/build-passing-brightgreen?style=for-the-badge&logo=github)
![Docker](https://img.shields.io/badge/docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)

**Logistics Dispatch Service** es un motor backend de alto rendimiento para logística de última milla. Diseñado con una arquitectura híbrida orientada a eventos, capaz de gestionar flotas masivas en tiempo real con latencia sub-segundo.

> **ℹ️ Nota:** Este repositorio contiene únicamente el Backend (API + Websockets).

---

## 🚀 Quick Start (Docker)

La forma más rápida de ejecutar el proyecto es utilizando **Docker Compose**. Esto levantará la API, la Base de Datos (PostgreSQL) y el bus de eventos (Redis) en un entorno aislado y pre-configurado.

### Prerrequisitos

- [Docker](https://www.docker.com/products/docker-desktop) instalado.

### Instalación

1. **Clonar el repositorio:**

   ```bash
   git clone <URL_DEL_REPO>
   cd logistics-dispatch-service
   ```

2. **Iniciar servicios:**
   ```bash
   docker-compose up --build
   ```

¡Listo! El sistema estará disponible en:

- **API**: `http://localhost:3001`
- **Documentación API (Swagger)**: `http://localhost:3001/api-docs`
- **Métricas del Sistema**: `http://localhost:3001/api/admin/metrics`

---

## � Instalación Manual (Desarrollo Local)

Si prefieres ejecutarlo manualmente en tu máquina:

1. **Requisitos:** Node.js (v18+), PostgreSQL y Redis ejecutándose localmente.
2. **Configuración:**
   - Copia `.env.example` (o usa el `.env` incluido) y ajusta `DATABASE_URL` y `REDIS_URL`.
3. **Instalar dependencias:**
   ```bash
   npm install
   ```
4. **Inicializar Base de Datos:**
   ```bash
   npx prisma generate
   # Si tienes una DB local configurada en .env:
   npx prisma db push
   ```
5. **Ejecutar en modo dev:**
   ```bash
   npm run dev
   ```

---

## � Documentación Técnica

Todo el conocimiento detallado del proyecto se encuentra organizado en la carpeta `LDE-INFO/`:

- 📈 **[Visión del Producto (PRODUCT_OVERVIEW)](./LDE-INFO/PRODUCT_OVERVIEW.md)**: Explicación de negocio, capacidades de carga, arquitectura y propuesta de valor.
- 🧪 **[Guía de Pruebas (TESTING_GUIDE)](./LDE-INFO/TESTING_GUIDE.md)**: Cómo ejecutar Unit Tests, pruebas de integración y los **Scripts de Carga (Stress Testing)**.

---

## � Funcionalidades Clave

### 👨‍💼 Operaciones (Dispatcher)

- **Dashboard en Tiempo Real**: Websockets para ver el movimiento de la flota sin refrescar.
- **Auditoría**: Trazabilidad completa de cada paquete.

### 🚲 Conductores

- **Ingesta Optimizada**: API ligera (`POST /location`) desacoplada con Redis Pub/Sub para soportar redes inestables.

### 🏠 Cliente Final

- **Tracking Público**: Endpoint SSE (`Server-Sent Events`) para seguimiento en vivo (`/track/:code/stream`).
- **Privacidad**: Coordenadas enmascaradas para proteger al conductor.

---

## ⚙️ Arquitectura & Observabilidad

El sistema cuenta con endpoints de autodiagnostico y protección:

- **Health Check**: `GET /api/health`
- **System Metrics**: `GET /api/admin/metrics` (CPU, Memoria, Estado de DB/Redis, Clientes Conectados).
- **Strict Validation**: El servicio no arranca si faltan variables de entorno críticas (Fail-fast).

---

## 🤝 Licencia

Este proyecto es Open Source bajo la licencia **ISC**.
