# 🧪 Guía de Pruebas y QA - Logistics Dispatch Service

Esta guía detalla cómo validar la funcionalidad, rendimiento y robustez del sistema LDE.

---

## 1. Pruebas Unitarias e Integración (Jest)

El proyecto incluye una suite de tests automatizados que verifica la lógica de negocio crítica, la seguridad de las rutas y la coherencia de los datos.

### Ejecución

```bash
# Ejecutar toda la suite
npm test

# Ejecutar un archivo específico
npx jest tests/public_tracking.test.ts
```

> **Nota:** Los tests requieren una instancia de Redis corriendo (o Docker). Si el test falla por `ECONNREFUSED`, asegúrate de que Redis esté activo en el puerto 6379 o configura `.env`.

---

## 2. Pruebas de Carga (Stress Testing)

Para validar la arquitectura, incluimos un script de "Tormenta de Tráfico" que simula una flota de 50-500 conductores bombardeando el sistema simultáneamente.

### Ubicación

Los scripts de carga se han movido a: `LDE-INFO/stress-tests/`

### ¿Qué hace la prueba?

1. Crea 50 conductores y paquetes en la base de datos.
2. Abre 50 conexiones SSE (clientes públicos) escuchando eventos.
3. Lanza 1,000 actualizaciones de ubicación (`PATCH /location`) en ráfaga (concurrencia masiva).
4. Mide latencia, tasa de entrega y estabilidad del servidor.

### Cómo Ejecutar (PowerShell)

```powershell
# Asegúrate de que el servidor (o Docker) esté corriendo en el puerto 3001
# O usa el orquestador automático que levanta su propio servidor:

cd LDE-INFO/stress-tests
powershell -ExecutionPolicy Bypass -File run_stress.ps1
```

---

## 3. Verificación de Observabilidad

El sistema expone métricas en tiempo real. Esto es útil para monitorear la salud del servicio durante las pruebas de carga.

**Endpoint:** `GET /api/admin/metrics`
**Headers:** `Authorization: Bearer <TOKEN_DE_DISPATCHER>`

**Ejemplo de Respuesta:**

```json
{
  "status": "online",
  "uptime": "345s",
  "resources": {
    "memory_rss_mb": 120,
    "memory_heap_mb": 85
  },
  "components": {
    "database": { "status": "ok", "latency_ms": 2 },
    "redis": { "status": "ok", "latency_ms": 1 },
    "websockets": { "connected_clients": 50 }
  }
}
```

### Escenario de Prueba Manual de Métricas

1. Inicia el servidor (`docker-compose up`).
2. Conecta 5 pestañas de navegador al panel de dispatcher (simulado).
3. Consulta el endpoint de métricas.
4. Verifica que `websockets.connected_clients` sea 5.

---

## 4. Escenarios de Caos (Chaos Engineering)

Para validar la resiliencia (ya implementada en código), puedes intentar:

1. **Matar Redis:** Detén el contenedor de Redis (`docker stop logistics-redis`). El API no debe caerse, solo debe dejar de transmitir eventos en vivo.
2. **Reinicio de API:** Reinicia el contenedor de Node.js. Los clientes SSE deberían reconectarse automáticamente gracias al mecanismo de `retry`.
