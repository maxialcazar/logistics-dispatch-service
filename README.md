# 📦 Logistics Dispatch Service (LDE)

![Build Status](https://img.shields.io/badge/build-passing-brightgreen?style=for-the-badge&logo=github)
![Docker](https://img.shields.io/badge/docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)

**Logistics Dispatch Service** es un motor backend de alto rendimiento para logística de última milla. Diseñado con una arquitectura híbrida orientada a eventos, capaz de gestionar flotas masivas en tiempo real con latencia sub-segundo y aislamiento multi-tenant.

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

- **API**: `http://localhost:3010`
- **Documentación API (Swagger)**: `http://localhost:3010/api-docs`
- **Métricas del Sistema**: `http://localhost:3010/api/admin/metrics`

---

## 💻 Instalación Manual (Desarrollo Local)

Si prefieres ejecutarlo manualmente en tu máquina:

1. **Requisitos:** Node.js (v18+), PostgreSQL y Redis ejecutándose localmente.
2. **Configuración:**
   - Copia `.env.example` (o usa el `.env` incluido) y asegura que `PORT=3010`.
3. **Instalar dependencias:**
   ```bash
   npm install
   ```
4. **Inicializar Base de Datos:**
   ```bash
   npx prisma generate
   # Resetear DB para desarrollo limpio:
   npx prisma db push --force-reset
   ```
5. **Ejecutar en modo dev:**
   ```bash
   npm run dev
   ```

---

## 🧪 Pruebas de Carga (Load Testing Impactante)

Hemos incluido un script de ingeniería de performance capaz de simular **1250+ conductores** y **5 empresas** operando simultáneamente para validar la escalabilidad.

### Ejecución del Test de Estrés

```bash
# Limpiar DB para consistencia
npx prisma db push --force-reset

# Ejecutar Simulador Masivo
npx ts-node scripts/load-test.ts
```

**Resultados Esperados:**

- Generación de ~5000 transacciones en < 2 minutos.
- Reporte ASCII detallado con Latencias (p95, p99) y RPS por endpoint.
- Verificación de aislamiento Multi-Tenant (Empresa A no ve datos de Empresa B).

---

## 📚 Documentación Técnica

Todo el conocimiento detallado del proyecto se encuentra organizado en la carpeta `LDE-INFO/`:

- 📈 **[Visión del Producto (PRODUCT_OVERVIEW)](./LDE-INFO/PRODUCT_OVERVIEW.md)**: Explicación de negocio, capacidades de carga validadas (1250+ drivers) y propuesta de valor.
- 🧪 **[Guía de Pruebas (TESTING_GUIDE)](./LDE-INFO/TESTING_GUIDE.md)**: Detalle profundo sobre cómo ejecutar Unit Tests y Stress Tests.

---

## ⚙️ Arquitectura & Observabilidad

El sistema cuenta con endpoints de autodiagnostico y protección:

- **Rate Limiting**: Protección DDoS configurable (`50000` reqs/window para tests, `5000` para prod).
- **Health Check**: `GET /api/health`
- **System Metrics**: `GET /api/admin/metrics` (CPU, Memoria, Estado de DB/Redis, Clientes Conectados).
- **Strict Validation**: El servicio no arranca si faltan variables de entorno críticas (Fail-fast).

---

## 🤝 Licencia

Este proyecto es Open Source bajo la licencia **ISC**.
