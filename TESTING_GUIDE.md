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
- **Validación de Datos (Zod)**: Asegura que el servidor bloquee peticiones con datos faltantes o incorrectos (ej: contraseñas insuficientes o campos vacíos).

---

## 📖 2. Pruebas Manuales (Swagger UI)

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
