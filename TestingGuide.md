# 🛠️ Logistics Dispatch Service - Testing Guide

Bienvenido a la guía de pruebas del servicio de despacho logístico. Esta guía te ayudará a verificar el correcto funcionamiento de la API, desde la autenticación hasta la gestión de zonas y paquetes.

---

## 📋 Requisitos Previos

Antes de comenzar, asegúrate de tener:

- **Node.js** v18+ instalado.
- **Servidor en ejecución**: `npm run dev`
- **Base de datos**: Migraciones aplicadas con `npx prisma migrate dev`.
- **Cliente de API**: Postman, Insomnia o `curl`.

---

## 🔐 Autenticación (JWT)

Casi todos los endpoints requieren un token JWT en el header `Authorization`.

### 1. Iniciar Sesión

**POST** `/api/auth/login`

> [!IMPORTANT]
> Debes enviar las credenciales en formato JSON.

```json
{
  "username": "tu_usuario",
  "password": "tu_password"
}
```

**Respuesta Exitosa:**

```json
{
  "token": "eyJhbGciOiJIUzI1...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "dispatcher"
  }
}
```

> [!TIP]
> Copia el `token` y añádelo a tus siguientes peticiones como Bearer Token:
> `Authorization: Bearer <TU_TOKEN>`

---

## 🚦 Flujos de Prueba por Rol

La API utiliza un sistema de Control de Acceso Basado en Roles (RBAC).

### 🏢 Despachador (Dispatcher)

El despachador tiene control total sobre el sistema.

| Método | Endpoint                 | Descripción                  |
| :----- | :----------------------- | :--------------------------- |
| `GET`  | `/api/drivers`           | Listar todos los conductores |
| `POST` | `/api/drivers`           | Crear un nuevo conductor     |
| `POST` | `/api/drivers/:id/zones` | Asignar zonas a un conductor |
| `GET`  | `/api/packages`          | Ver todos los paquetes       |

### 🚚 Conductor (Driver)

El conductor tiene acceso limitado a su propia información.

| Método | Endpoint                | Descripción                |
| :----- | :---------------------- | :------------------------- |
| `GET`  | `/api/drivers/me/zones` | Ver mis zonas asignadas    |
| `GET`  | `/api/packages/me`      | Ver mis paquetes asignados |

---

## 📦 Gestión de Paquetes

### Crear un Paquete

**POST** `/api/packages`

```json
{
  "trackingNumber": "PKG-12345",
  "recipient": "Juan Pérez",
  "address": "Calle Falsa 123",
  "zoneId": 1
}
```

---

## 🛠️ Herramientas Útiles

> [!NOTE]
> **Health Check**: Si el servidor no responde, verifica `/api/health`. Debería devolver `{"status": "ok"}`.

### Scripts de Utilidad

Si necesitas verificar datos rápidamente en la base de datos:

- `ts-node check_users.ts`: Verifica los usuarios creados.
- `ts-node test_hash.ts`: Comprueba el hashing de contraseñas.

---

## ⚠️ Errores Comunes

| Código | Mensaje               | Solución                                               |
| :----- | :-------------------- | :----------------------------------------------------- |
| `401`  | Unauthorized          | Falta el token o ha expirado.                          |
| `403`  | Forbidden             | No tienes el rol necesario (`dispatcher` o `driver`).  |
| `400`  | Bad Request           | Formato JSON inválido o faltan campos obligatorios.    |
| `500`  | Internal Server Error | Revisa los logs de la consola para ver el stack trace. |

---

> [!CAUTION]
> No compartas el archivo `.env` ni los tokens generados en entornos de producción.
