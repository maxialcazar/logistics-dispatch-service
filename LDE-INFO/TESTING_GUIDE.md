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

> **Nota:** Los tests requieren una instancia de Redis corriendo (o Docker). Si el test falla por `ECONNREFUSED`, asegúrate de que Redis esté activo en el puerto **6380** (mapeado desde el 6379 de Docker) o configura `.env`.

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

1.  **Iniciar Infraestructura (Docker):**

    ```bash
    docker-compose up -d db redis
    ```

2.  **Iniciar Servidor Backend:**

    ```bash
    npm run dev
    ```

3.  **Abrir Dashboard de Monitoreo:**
    - Navega a `http://localhost:3010/monitor.html`.
    - Haz clic en **"Connect (Auto-Retry)"**.
    - _Nota: Verás errores de conexión hasta que el script cree la empresa._

4.  **Lanzar Simulador de Carga:**
    En otra terminal:

    ```bash
    # Reset de DB para prueba limpia
    npx prisma db push --force-reset

    # Ejecutar script
    npx ts-node scripts/load-test.ts
    ```

---

## 3. Verificación de Observabilidad

El sistema expone métricas en tiempo real. Esto es útil para monitorear la salud del servicio durante las pruebas de carga.

**Endpoint:** `GET http://localhost:3010/api/admin/metrics` (o via Docker porta 3010)

---

## 4. Escenarios de Caos (Chaos Engineering)

Para validar la resiliencia:

1.  **Matar Redis:** `docker-compose stop redis`. El API dejará de transmitir eventos en vivo pero **NO** debe caerse (las peticiones HTTP seguirán funcionando).
2.  **Reconexión Automática:** Al volver a encender Redis (`docker-compose start redis`), los sockets deben reconectarse automáticamente en <2s.
3.  **Saturación:** Ejecuta el `load-test.ts` con `DISPATCHERS_COUNT = 50`. Verás cómo el `p95` aumenta, pero el `Err%` debe mantenerse bajo gracias al Rate Limiting.

_Guía actualizada el 2026-02-11 para entorno Dockerizado._
