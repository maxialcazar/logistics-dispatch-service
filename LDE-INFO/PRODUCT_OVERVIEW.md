# 📦 Logistics Dispatch Engine (LDE)

> **Solución Backend de Alto Rendimiento para Logística de Última Milla**

## 🚀 Resumen Ejecutivo

Logistics Dispatch Engine (LDE) es una API Backend de arquitectura empresarial diseñada para orquestar operaciones logísticas en tiempo real. A diferencia de las soluciones monolíticas tradicionales, LDE utiliza una **arquitectura híbrida orientada a eventos** que garantiza latencia sub-segundo, escalabilidad horizontal y robustez ante fallos de red, soportando flotas de cientos de conductores simultáneos sin degradación del servicio.

---

## 💎 Propuesta de Valor

### 1. Visibilidad en Tiempo Real (Real-Time Visibility)

Olvídese del "polling" (consultar cada X segundos). LDE empuja la información en el instante en que ocurre.

- **Para el Cliente Final:** Experiencia tipo "Uber". Un enlace público seguro (`SSE`) permite ver al conductor acercarse en vivo en el mapa.
- **Para la Central:** Tablero de control actualizado vía WebSockets. Vea a toda su flota moverse en el mapa sin recargar la página.

### 2. Privacidad y Seguridad por Diseño

- **Enmascaramiento de Datos:** El cliente final ve dónde está su paquete, pero **nunca** accede a la identidad privada del conductor ni a sus coordenadas exactas fuera del contexto de la entrega.
- **Protección de Infraestructura:** Sistema nativo de _Rate Limiting_ (limitación de velocidad) que protege al núcleo del negocio contra ataques DDoS o saturación por clientes defectuosos.

### 3. Resiliencia en Redes Móviles

Sabemos que los conductores pierden señal constantemente.

- **Ingesta Stateless:** Los conductores envían actualizaciones vía HTTP ligero optimizado. Si la conexión se cae, el sistema recupera el flujo inmediatamente sin necesidad de reconexiones pesadas de WebSocket.
- **Bus de Eventos (EventBus):** Un bus de mensajes basado en Redis desacopla la recepción de datos de la transmisión, asegurando que un pico de tráfico de conductores nunca colapse el panel de los operadores.

---

## 📊 Métricas de Rendimiento y Capacidad

_Datos validados mediante pruebas de estrés (Load Testing) en entorno controlado._

| Métrica                     | Capacidad Demostrada  | Descripción                                                                         |
| :-------------------------- | :-------------------- | :---------------------------------------------------------------------------------- |
| **Throughput de Ingesta**   | **200+ req/seg**      | Capaz de procesar >12,000 actualizaciones de ubicación por minuto.                  |
| **Flota Simultánea**        | **50 - 500 Drivers**  | Validado para flotas medianas con frecuencia de actualización agresiva (cada 3-5s). |
| **Latencia de Propagación** | **< 100ms**           | Tiempo desde que el conductor envía su GPS hasta que el cliente lo ve.              |
| **Conexiones Concurrentes** | **Escalable (Redis)** | Arquitectura lista para escalar horizontalmente añadiendo nodos Node.js.            |

> **Nota de Robustez:** Durante las pruebas de caos, el sistema soportó desconexiones masivas de clientes y reinicios de servicios sin perder la integridad de los datos transaccionales (PostgreSQL).

---

## 🛠️ Especificaciones Técnicas

### Stack Tecnológico

- **Core:** Node.js + Express + TypeScript (Tipado estático seguro).
- **Base de Datos:** PostgreSQL (Relacional) con Prisma ORM (Integridad referencial).
- **Real-Time Engine:** Redis Pub/Sub + Socket.IO (Backoffice) + Server-Sent Events (Clientes Públicos).
- **Seguridad:** JWT (JSON Web Tokens), `helmet` (Cabeceras seguras), `bcrypt` (Hashing).

### Funcionalidades Clave (API Endpoints)

1.  **Gestión de Flota:** CRUD completo de conductores y asignación inteligente de Zonas.
2.  **Tracking Público Seguro:** Endpoint de _Streaming_ unidireccional que reconecta automáticamente si el cliente pierde internet.
3.  **Auditoría:** Historial completo de estados del paquete (`pending` -> `in_transit` -> `delivered`).

---

## ☁️ Despliegue Universal (Docker Ready)

LDE se entrega completamente "Dockerizado", lo que significa que es agnóstico a la infraestructura:

- **Cloud:** Compatible con AWS ECS, Google Cloud Run, Azure o DigitalOcean.
- **On-Premise:** Puede correr en servidores propios con un simple `docker-compose up`.
- **Portabilidad:** Garantía de "escríbelo una vez, ejecútalo en cualquier lugar", eliminando conflictos de versiones o dependencias.

---

## 🎯 ¿Por qué elegir LDE?

Si su negocio necesita escalar de 10 a 1,000 entregas diarias, no puede depender de hojas de cálculo o sistemas que se actualizan cada 5 minutos. **LDE** ofrece la infraestructura de los gigantes logísticos, lista para conectar con cualquier Frontend (React, Vue, Mobile App) y empezar a operar hoy mismo.

---

_Documento generado automáticamente el 2026-02-06._
