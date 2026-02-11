# 🚚 Logistics Dispatch Service (LDE) - Sistema Integral de Última Milla

![Build Status](https://img.shields.io/badge/build-passing-brightgreen?style=for-the-badge&logo=github)
![Frontend](https://img.shields.io/badge/Frontend-React_18-blue?style=for-the-badge&logo=react)
![Backend](https://img.shields.io/badge/Backend-Node.js-green?style=for-the-badge&logo=nodedotjs)
![Database](https://img.shields.io/badge/Database-PostgreSQL-336791?style=for-the-badge&logo=postgresql)

**LDE (Logistics Dispatch Enterprise)** es una solución completa para la gestión logística de despacho y seguimiento de flotas en tiempo real. Combina un potente backend de alto rendimiento con una interfaz de administración moderna y una aplicación móvil progresiva para conductores.

## 🌟 Características Principales

### 1. Panel de Control (Dispatcher & Admin)

- **Centro de Despacho Drag & Drop:** Asignación visual de Zonas a Conductores.
- **Gestión de Paquetes:** Creación, edición, archivo y cancelación de envíos.
- **Monitoreo en Vivo:** Mapa interactivo con la ubicación real de toda la flota y estado de entregas.
- **Gestión de Zonas y Conductores:** CRUD completo con validaciones de seguridad.

### 2. App Móvil Progressive Web App (PWA)

- **Instalable:** Manifiesto web para "Agregar a Pantalla de Inicio" y experiencia nativa.

- **Dashboard Personalizado:** Lista de entregas priorizada y optimización de ruta.
- **Navegación:** Integración directa con Google Maps/Waze.

### 3. Módulo de Inteligencia de Negocio (Nuevo)

- **Analíticas Avanzadas:** Reportes visuales con Recharts (Gráficos de Barras, Tortas).
- **KPIs en Tiempo Real:** Métricas de eficiencia, tiempos de entrega y distribución por zonas.
- **Top Conductores:** Ranking de productividad semanal.

### 4. Backend de Alto Rendimiento

- **Arquitectura Híbrida:** Redis Write-Back Buffer para ingesta masiva de GPS.
- **Event-Driven:** WebSocket (Socket.io) para actualizaciones en <100ms.
- **Seguridad:** Autenticación JWT y Roles (Admin, Dispatcher, Driver).

---

## 🚀 Quick Start (Desarrollo Local)

### Prerrequisitos

- Node.js 18+
- Docker (opcional, para Base de Datos y Redis)
- PostgreSQL y Redis corriendo localmente.

### 1. Configuración del Backend

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno (crear .env basado en .env.example)
# Asegurar DATABASE_URL y REDIS_URL

# Iniciar Base de Datos (si usa Docker)
docker-compose up -d

# Migrar Schema
npx prisma db push

# Iniciar Servidor (Puerto 3010)
npm run dev
```

### 2. Configuración del Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar Cliente React (Puerto 5173)
npm run dev
```

Acceder a: `http://localhost:5173`

---

## 📱 Guía de Uso del Sistema

### Flujo de Despacho

1.  **Crear Zonas:** Definir áreas geográficas (ej. Centro, Norte) en `/zones`.
2.  **Registrar Conductores:** Crear usuarios y credenciales en `/drivers`.
3.  **Ingresar Paquetes:** Crear nuevos envíos asignados a una Zona en `/packages/new`.
4.  **Asignar:** En el **Centro de Despacho (`/dispatch`)**, arrastrar la Zona al Conductor disponible.

### Flujo del Conductor

1.  Ingresar a la aplicación con las credenciales creadas por el Admin.
2.  El sistema detecta el rol y redirige automáticamente a la **Interfaz Móvil**.
3.  Visualizar paquetes en "Mis Paquetes".
4.  Pulsar "Iniciar Viaje" -> "Navegar" -> "Entregar".
5.  El Admin ve el cambio de estado en tiempo real en el Monitor.

---

## 📚 Documentación Técnica Adicional

En la carpeta `LDE-INFO` encontrará detalles profundos:

- 📈 **[Visión del Producto (PRODUCT_OVERVIEW)](./LDE-INFO/PRODUCT_OVERVIEW.md)**: Explicación de arquitectura y módulos.
- 🧪 **[Guía de Pruebas (TESTING_GUIDE)](./LDE-INFO/TESTING_GUIDE.md)**: Stress testing y validación de sockets.
- 📱 **[Guía APP Conductor (DRIVER_GUIDE)](./LDE-INFO/DRIVER_APP_GUIDE.md)**: Manual específico para la interfaz móvil.

---

## ⚙️ Arquitectura & Observabilidad

El sistema cuenta con:

- **Redis Buffer:** Ingesta de GPS optimizada.
- **Background Worker:** Sincronización asíncrona a PostgreSQL.
- **Soft Delete & Archiving:** Historial preservado para auditoría.

## 🤝 Licencia

Este proyecto es Open Source bajo la licencia **ISC**.
