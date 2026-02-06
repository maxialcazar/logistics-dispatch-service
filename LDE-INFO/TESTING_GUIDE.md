# 🧪 Guía de Pruebas (Testing Guide)

Esta guía explica cómo verificar el correcto funcionamiento del backend del **Logistics Dispatch Service**, tanto mediante pruebas automatizadas como manuales.

---

## 🤖 1. Pruebas Automatizadas (Jest + Supertest)

Hemos implementado un conjunto de pruebas que verifican la salud de la API y las reglas de validación.

### Ejecutar todos los tests

```bash
npm test
```

### Ejecutar un test específico

```bash
# Ejemplo: Probar solo validación de login
npx jest tests/auth_validation.test.ts
```

### Qué cubren los tests actuales:

- **Salud del Sistema**: Verifica que el endpoint `/api/health` responda correctamente.
- **Validación de Datos (Zod)**: Asegura que el servidor bloquee peticiones con datos faltantes o incorrectos.
- **Tracking Público y Privacidad**: Verifica que el portal público (`/api/public/track`) devuelva datos, aplique el enmascaramiento de direcciones y respete los límites de velocidad (Rate Limiting).
- **Geocodificación**: Valida que los paquetes acepten coordenadas GPS lat/lng y que los conductores puedan actualizar su ubicación en tiempo real.
- **SSE Streams**: Verifica que la conexión al stream `/api/public/track/{trackingCode}/stream` se mantenga abierta y reciba "heartbeats".

---

## 🛰️ 2. Pruebas de Tiempo Real (Híbrido)

### WebSockets (Backoffice)

1. Conecta un cliente Socket.IO a `ws://localhost:3001`.
2. Envía un `PATCH /api/drivers/location` con coordenadas.
3. Verifica que el socket reciba el evento `driver-location-updated`.

### Server-Sent Events (Público)

1. Abre en tu navegador (o usa `curl`): `http://localhost:3001/api/public/track/{TRACKING_CODE}/stream`.
2. Deberías ver una conexión permanente que recibe datos periódicamente (heartbeats `: heartbeat` o updates `data: {...}`).

---

## 🧪 3. Pruebas de Resiliencia (Chaos Testing)

### Simulación de Fallo de Redis

1. Detén Redis (`docker stop redis` o similar).
2. Intenta enviar una ubicación de conductor (`PATCH`).
3. **Resultado Esperado**: El endpoint debe responder `200 OK` (modo "Fire and Forget"), aunque el evento no se emita. El sistema no debe colgarse.

### Simulación de Inestabilidad de Red (SSE)

1. Conéctate al stream SSE.
2. Desconecta tu internet brevemente.
3. **Resultado Esperado**: El navegador intentará reconectar automáticamente (gracias a `retry: 10000`).

---

## 🔒 4. Pruebas de Seguridad y Privacidad

### Verificación de Enmascaramiento de Dirección

1. Crea un paquete con una dirección específica.
2. Accede al endpoint público: `GET /api/public/track/{trackingCode}`.
3. Confirma que la dirección mostrada termine en `***` y no exponga el número exacto de la calle.

### Verificación de Rate Limiting

1. Intenta acceder al endpoint de tracking masivamente (más de 20 veces por hora).
2. El sistema deberá retornar un error `429 Too Many Requests`.

La forma más sencilla de probar los endpoints es a través de la documentación interactiva.

1. Inicia el servidor: `npm run dev`
2. Abre en tu navegador: [http://localhost:3001/api-docs](http://localhost:3001/api-docs)
3. **Flujo de prueba sugerido**:
   - Ve a `POST /api/auth/login`.
   - Haz clic en "Try it out" y usa las credenciales de un usuario existente.
   - Copia el `token` de la respuesta.
   - Haz clic en el botón **Authorize** (arriba a la derecha) y pega el token.
   - ¡Ahora puedes probar los endpoints protegidos (Drivers, Zones, Packages)!

---

## ⚡ 3. Pruebas de Rendimiento (Redis)

Si tienes Redis habilitado (`REDIS_ENABLED=true` en `.env`), puedes verificar la caché de la siguiente manera:

1. Realiza una petición `GET /api/zones`.
2. Revisa los logs en la terminal. Deberías ver una consulta a PostgreSQL.
3. Realiza la misma petición de nuevo.
4. La respuesta debería ser casi instantánea y no verás una nueva consulta a la base de datos en los logs (los datos vienen de Redis).

---

## 🔍 4. Monitoreo de Logs

Para ver qué está pasando "bajo el capó" o depurar errores internos:

- **Logs en vivo**: Revisa la terminal donde corre `npm run dev`.
- **Archivos de Log**:
  - `logs/error.log`: Solo contiene errores críticos y sus stack traces.
  - `logs/combined.log`: Registro completo de todas las peticiones HTTP y eventos de la aplicación.

---

## 🛠️ 5. Herramientas Recomendadas

- **Postman / Insomnia**: Para pruebas manuales más complejas.
- **TablePlus / DBeaver**: Para inspeccionar los datos directamente en PostgreSQL.
- **Redis Insight**: Para visualizar las claves guardadas en la caché.
