# 📦 Logistics Dispatch Service (LDE) - Enterprise Edition

![Build Status](https://img.shields.io/badge/build-passing-brightgreen?style=for-the-badge&logo=github)
![Architecture](https://img.shields.io/badge/Architecture-Event--Driven-orange?style=for-the-badge&logo=redis&logoColor=white)
![Performance](https://img.shields.io/badge/Latency-24ms-blueviolet?style=for-the-badge&logo=lightning&logoColor=white)
![Docker](https://img.shields.io/badge/docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)

**Logistics Dispatch Service** es un motor backend de alto rendimiento para logística de última milla.
Diseñado con una **arquitectura híbrida de ingesta asíncrona (Write-Back Cache)**, capaz de gestionar flotas masivas (5,000+ conductores) en tiempo real con latencia sub-segundo y carga en base de datos mínima.

> **🚀 Nueva Funcionalidad (Feb 2026):** Implementación de Redis Write-Back Buffer para reducir la latencia de GPS en un **60%** y la carga en DB en un **90%**.

---

## ⚡ Quick Start (Docker)

1. **Clonar e Iniciar:**

   ```bash
   git clone <REPO_URL>
   cd logistics-dispatch-service
   docker-compose up --build
   ```

2. **Endpoints:**
   - **API**: `http://localhost:3010`
   - **Swagger Docs**: `http://localhost:3010/api-docs`
   - **Metrics**: `http://localhost:3010/api/admin/metrics`

---

## 🧪 Pruebas de Carga & Validación

Incluimos un script de ingeniería de performance capaz de simular **1,600 transacciones/segundo**.

### Ejecución del Test de Estrés (Con Validación WebSockets)

```bash
# Paso 1: Limpiar Base de Datos
npx prisma db push --force-reset

# Paso 2: Ejecutar Simulador Masivo
npx ts-node scripts/load-test.ts
```

**Resultados Esperados:**

- **RPS (Throughput):** > 1,500 req/seg.
- **Latencia Real (Socket):** ~24ms (Instantáneo).
- **Estabilidad:** 0.0% Error Rate.

---

## 📚 Documentación Técnica

- 📈 **[Visión del Producto & Arquitectura (PRODUCT_OVERVIEW)](./LDE-INFO/PRODUCT_OVERVIEW.md)**: Explicación detallada del patrón Write-Back y ventajas competitivas.
- 🧪 **[Guía de Pruebas (TESTING_GUIDE)](./LDE-INFO/TESTING_GUIDE.md)**: Cómo validar el sistema bajo presión.

---

## ⚙️ Arquitectura & Observabilidad

El sistema cuenta con:

- **Redis Buffer:** Ingesta de GPS en memoria ram.
- **Background Worker:** Sincronización asíncrona a PostgreSQL cada 5 segundos.
- **Rate Limiting:** Protección DDoS configurable.
- **Health Check:** `GET /api/health`

---

## 🤝 Licencia

Este proyecto es Open Source bajo la licencia **ISC**.
