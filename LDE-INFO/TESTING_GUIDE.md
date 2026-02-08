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

### Cómo Ejecutar la Prueba de Estrés

Para obtener resultados limpios y evitar conflictos de duplicados en la BD:

```bash
# 1. Resetear la Base de Datos (¡Cuidado! Borra datos)
npx prisma db push --force-reset

# 2. Ejecutar el Simulador
npx ts-node scripts/load-test.ts
```

### Interpretación del Reporte

Al finalizar, verás una tabla como esta:

```text
┌─────────┬───────────────────────────────┬──────┬───────┬────────┬─────────┬─────────┬─────────┐
│ (index) │ Label                         │ Reqs │ RPS   │ Err%   │ Med(ms) │ p95(ms) │ p99(ms) │
├─────────┼───────────────────────────────┼──────┼───────┼────────┼─────────┼─────────┼─────────┤
│ 1       │ 'PATCH /drivers/location'     │ 4500 │ '50.0'│ '0.0%' │ '15'    │ '70'    │ '120'   │
└─────────┴───────────────────────────────┴──────┴───────┴────────┴─────────┴─────────┴─────────┘
```

- **p95 (Percentil 95):** El 95% de las peticiones fueron más rápidas que este valor. Es la métrica más importante para UX.
- **RPS (Requests Per Second):** Capacidad de procesamiento (Throughput).
- **Err%:** Tasa de fallo. En producción debe ser < 0.1%.

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
