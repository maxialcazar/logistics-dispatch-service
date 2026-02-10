# 📦 LDE (Logistics Dispatch Engine) - Plataforma Integral de Logística

> **La Solución Completa para la Gestión de Última Milla de Alto Rendimiento**

---

## 🏗️ Introducción

**LDE (Logistics Dispatch Enterprise)** no es solo un backend; es un ecosistema completo que conecta a los **Despachadores** en la oficina central con los **Conductores** en el campo en tiempo real.

Nuestra arquitectura garantiza que mientras el negocio escala de 10 a 10,000 entregas diarias, el sistema se mantiene rápido, fluido y robusto, utilizando tecnologías de vanguardia como **Redis Write-Back Buffering** y **React 18** con actualizaciones optimistas.

---

## 📱 Módulos del Sistema

### 1. Panel de Administración y Despacho (Web App)

El centro de comando para los operadores logísticos.

- **Centro de Despacho Visual:** Interfaz "Drag & Drop" intuitiva para asignar zonas completas a conductores.
- **Gestión de Zonas Geográficas:** Creación flexible de áreas de cobertura.
- **Monitor en Tiempo Real:** Mapa interactivo con tecnología WebSocket que muestra:
  - Ubicación exacta de cada conductor (actualizada cada 3s).
  - Estado de cada paquete (Pendiente, En Camino, Entregado).
  - Métricas de rendimiento de la flota hoy.
- **Gestión de Inventario (CRUD):** Creación manual de paquetes con geocodificación automática de direcciones.

### 2. Aplicación para Conductores (App Móvil / PWA)

Una interfaz simplificada y libre de distracciones diseñada para ser usada en movimiento.

- **Sin Configuraciones:** El conductor solo inicia sesión con sus credenciales.
- **Dashboard Priorizado:** Lista de entregas ordenada, ocultando lo que ya se completó.
- **Navegación en un Click:** Botón "Navegar" que abre automáticamente Google Maps con la ruta más rápida hacia el destino.
- **Actualización de Estado:** Botones grandes y claros para marcar "Entregado" o "Fallido", lo que sincroniza instantáneamente con la central.

### 3. Motor Backend (API + Workers)

El cerebro invisible que procesa miles de eventos por segundo.

- **Redis Write-Back Cache:** Las ubicaciones GPS se guardan primero en memoria RAM y se sincronizan a la base de datos en segundo plano, reduciendo la carga del servidor en un **90%**.
- **Socket.IO Clusters (Rooms):** Aislamiento de datos por empresa (Tenant Isolation) en tiempo real.
- **Seguridad:** Autenticación JWT robusta con Roles (Admin, Dispatcher, Driver).

---

## 💎 Arquitectura "Enterprise-Grade"

Hemos implementado patrones de diseño utilizados por gigantes como Uber/Rappi para garantizar escalabilidad infinita:

### ⚡ Flujo de Datos en Tiempo Real (The Loop)

1.  **Conductor (Móvil):** El GPS del teléfono envía coordenadas al API.
2.  **API (Ingesta):** Guarda en Redis en <5ms y publica el evento en el Bus interna.
3.  **Socket Server:** Retransmite el evento _solo_ a la sala de la empresa correspondiente.
4.  **Despachador (Web):** El mapa recibe el evento y mueve el ícono del camión suavemente.
5.  **Persistencia (Worker):** Cada 5 segundos, un proceso en segundo plano guarda el historial en PostgreSQL para auditoría.

---

## 📊 Benchmarks de Rendimiento (v2.0 - Feb 2026)

_Pruebas realizadas simulando 125 conductores activos simultáneamente._

| Métrica                 | Valor              | Análisis                                                               |
| :---------------------- | :----------------- | :--------------------------------------------------------------------- |
| **Throughput (RPS)**    | **4,500+ ops/seg** | Capacidad masiva gracias a Redis Write-Back + Pub/Sub optimizado.      |
| **Latencia Real (E2E)** | **73ms (Mediana)** | Tiempo desde que el conductor se mueve hasta que el mapa se actualiza. |
| **Carga Base de Datos** | **< 2% CPU**       | Gracias a la estrategia de escritura diferida (Write-Back).            |

---

## 🛠️ Stack Tecnológico

### Frontend (Cliente)

- React 18 + Vite
- Tailwind CSS (Diseño Moderno & Responsive)
- Leaflet Maps (Visualización Geoespacial)
- Lucide React (Iconografía)
- Socket.io-Client

### Backend (Servidor)

- Node.js + Express
- TypeScript
- Prisma ORM (Gestión de Base de Datos PostgreSQL)
- Redis (Caché & Pub/Sub)
- Socket.io (WebSockets)

---

## 🎯 ¿Por qué elegir LDE?

LDE no es solo un "tracker" de GPS. Es un **Sistema Operativo Logístico**. Permite que una empresa pequeña opere con la misma eficiencia tecnológica que una multinacional, automatizando la asignación, el seguimiento y la auditoría de cada entrega.

_Documento actualizado el 2026-02-09 con Arquitectura Full-Stack._
