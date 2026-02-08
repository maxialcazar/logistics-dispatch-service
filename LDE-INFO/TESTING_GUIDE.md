# 🧪 Guía de Pruebas y QA - Logistics Dispatch Service

Esta guía detalla cómo validar la funcionalidad, rendimiento y robustez del sistema LDE.

---

## 1. Pruebas Unitarias e Integración (Jest)

El proyecto incluye una suite de tests automatizados que verifica la lógica de negocio crítica, la seguridad de las rutas y la coherencia de los datos.

### Ejecución

```bash
# Ejecutar toda la suite
npm test

# Ejecutar tests en modo watch
npm test -- --watch
```

> **Nota:** Los tests requieren una instancia de Redis corriendo (o Docker). Si el test falla por `ECONNREFUSED`, asegúrate de que Redis esté activo en el puerto 6379 o configura `.env`.

---

## 2. Pruebas de Carga (Stress Testing & Performance)

Para validar la arquitectura Multi-Tenant y la capacidad de concurrencia, utilizamos un script de ingeniería de performance desarrollado en TypeScript.

Este no es un simple script de "ping"; es un simulador de tráfico realista que emula el comportamiento de miles de usuarios.

### Ubicación del Script

- **Script:** `scripts/load-test.ts`
- **Configuración:** Variables `DISPATCHERS_COUNT` y `OBJECTS_PER_DISPATCHER` dentro del archivo.

### ¿Qué hace la prueba?

1.  **Multi-Tenancy:** Crea 5 empresas aisladas (Empresa A - E).
2.  **Generación Masiva:** En cada empresa, crea Dispatchers, Zonas, Conductores y Paquetes (volumen configurable).
3.  **Simulación Paralela:** Lanza simulaciones simultáneas tipo "tormena" donde miles de conductores envían actualizaciones GPS (`PATCH /location`) y consultan sus rutas (`GET /packages/me`).
4.  **Telemetría:** Recolecta tiempos de respuesta (latencia) y genera un reporte estadístico.

### Cómo Ejecutar la Prueba de Estrés (Con Monitor Visual)

Para validar tanto la capacidad bruta como la latencia "percibida" en tiempo real:

1.  **Iniciar Servidor Backend:**

    ```bash
    npm run dev
    ```

2.  **Abrir Dashboard de Monitoreo:**
    - Navega a `http://localhost:3010/monitor.html`.
    - Haz clic en **"Connect (Auto-Retry)"**.
    - _Nota: Verás errores de conexión hasta que el script cree la empresa._

3.  **Lanzar Simulador de Carga:**
    En otra terminal:
    ```bash
    npx prisma db push --force-reset
    npx ts-node scripts/load-test.ts
    ```

### Interpretación del Reporte (2026 Benchmark)

Al finalizar (aprox. 90 segundos), verás una tabla como esta:

```text
┌─────────┬───────────────────────────────┬───────┬──────────┬────────┬─────────┬─────────┬─────────┐
│ (index) │ Label                         │ Reqs  │ RPS      │ Err%   │ Med(ms) │ p95(ms) │ p99(ms) │
├─────────┼───────────────────────────────┼───────┼──────────┼────────┼─────────┼─────────┼─────────┤
│ 1       │ 'PATCH /drivers/location'     │ 18000 │ '185.0'  │ '0.0%' │ '90'    │ '350'   │ '500'   │
│ 9       │ 'WS Broadcast Lag'            │ 430000│ '4500.0' │ '0.0%' │ '73'    │ '260'   │ '400'   │
└─────────┴───────────────────────────────┴───────┴──────────┴────────┴─────────┴─────────┴─────────┘
```

- **WS Broadcast Lag:** Es la métrica crítica. Mide el tiempo desde que el conductor envía su posición hasta que el monitor la recibe. **Objetivo: < 100ms (Mediana).**
- **RPS (Throughput):** Volumen total de eventos procesados. **Objetivo: > 4,000 ops/seg.**

---

## 3. Verificación de Observabilidad

El sistema expone métricas en tiempo real. Esto es útil para monitorear la salud del servicio durante las pruebas de carga.

**Endpoint:** `GET /api/admin/metrics`

**Respuesta:**

```json
{
  "status": "online",
  "uptime": 345,
  "resources": { "memory_rss_mb": 120, "memory_heap_mb": 85 },
  "components": {
    "database": { "status": "ok", "latency_ms": 2 },
    "redis": { "status": "ok", "latency_ms": 1 },
    "websockets": { "connected_clients": 50 }
  }
}
```

---

## 4. Escenarios de Caos (Chaos Engineering)

Para validar la resiliencia:

1.  **Matar Redis:** `docker stop logistics-redis`. El API dejará de transmitir eventos en vivo pero **NO** debe caerse (las peticiones HTTP seguirán funcionando).
2.  **Saturación:** Ejecuta el `load-test.ts` con `DISPATCHERS_COUNT = 50`. Verás cómo el `p95` aumenta, pero el `Err%` debe mantenerse bajo gracias al Rate Limiting.
