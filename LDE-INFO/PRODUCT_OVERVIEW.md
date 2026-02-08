# 📦 Logistics Dispatch Engine (LDE)

> **Solución Backend de Alto Rendimiento para Logística de Última Milla**

## 🚀 Resumen Ejecutivo

Logistics Dispatch Engine (LDE) es una API Backend de arquitectura empresarial diseñada para orquestar operaciones logísticas en tiempo real. A diferencia de las soluciones monolíticas tradicionales, LDE utiliza una **arquitectura híbrida orientada a eventos** que garantiza latencia sub-segundo, escalabilidad horizontal y robustez ante fallos de red, soportando flotas masivas sin degradación del servicio.

---

## 💎 Propuesta de Valor

### 1. Visibilidad en Tiempo Real (Real-Time Visibility)

Olvídese del "polling" (consultar cada X segundos). LDE empuja la información en el instante en que ocurre.

- **Para el Cliente Final:** Experiencia tipo "Uber". Un enlace público seguro (`SSE`) permite ver al conductor acercarse en vivo en el mapa.
- **Para la Central:** Tablero de control actualizado vía WebSockets. Vea a toda su flota moverse en el mapa sin recargar la página.

### 2. Privacidad y Seguridad por Diseño

- **Enmascaramiento de Datos:** El cliente final ve dónde está su paquete, pero **nunca** accede a la identidad privada del conductor.
- **Rate Limiting Dinámico:** Protección nativa contra ataques DDoS configurable (`max: 50,000` reqs/window), asegurando que un pico de tráfico no tire abajo el servicio.

### 3. Resiliencia en Redes Móviles

Sabemos que los conductores pierden señal constantemente.

- **Ingesta Stateless:** Los conductores envían actualizaciones vía HTTP ligero optimizado. Si la conexión se cae, el sistema recupera el flujo inmediatamente.
- **Bus de Eventos (EventBus):** Un bus de mensajes basado en Redis desacopla la recepción de datos de la transmisión.

---

## 📊 Rendimiento Validado (Benchmark 2026)

_Resultados oficiales de pruebas de estrés realizadas en infraestructura de desarrollo (Single Node)._

| Escenario             | Volumen                       | Resultado                                         |
| :-------------------- | :---------------------------- | :------------------------------------------------ |
| **Simulación Masiva** | **1,250 Conductores** Activos | ✅ **0.0% Tasa de Error** en 5,000 transacciones. |
| **Ingesta de GPS**    | 4,500 Updates/min             | ✅ Latencia Mediana estable en motor de ingesta.  |
| **Concurrencia**      | 5 Empresas (Multi-Tenant)     | ✅ Aislamiento total de datos verificado.         |

> **Conclusión de Arquitectura:** El sistema ha demostrado capacidad para escalar horizontalmente. En producción (con múltiples nodos API detrás de un Load Balancer), la arquitectura está diseñada para soportar **10,000+ conductores** simultáneos.

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
3.  **Auditoría:** Historial completo de estados del paquete.

---

## ☁️ Despliegue Universal (Docker Ready)

LDE se entrega completamente "Dockerizado", lo que significa que es agnóstico a la infraestructura:

- **Cloud:** Compatible con AWS ECS, Google Cloud Run, Azure o DigitalOcean.
- **On-Premise:** Puede correr en servidores propios con un simple `docker-compose up`.
- **Portabilidad:** Garantía de "escríbelo una vez, ejecútalo en cualquier lugar".

---

## 🎯 ¿Por qué elegir LDE?

Si su negocio necesita escalar de 10 a 1,000 entregas diarias, no puede depender de hojas de cálculo o sistemas que se actualizan cada 5 minutos. **LDE** ofrece la infraestructura de los gigantes logísticos, lista para conectar con cualquier Frontend (React, Vue, Mobile App) y empezar a operar hoy mismo.

---

_Documento actualizado el 2026-02-06._
