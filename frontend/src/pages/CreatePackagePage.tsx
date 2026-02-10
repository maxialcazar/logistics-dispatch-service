import { useState, useEffect } from 'react';
import { Package, Plus, MapPin, AlertCircle, User, Phone, Box, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { packageService } from '../services/packageService';

interface Zone {
    id: string;
    name: string;
}

export function CreatePackagePage() {
  const { token } = useAuth();
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    trackingCode: '',
    
    // Sender
    senderName: '',
    senderAddress: '',
    senderPhone: '',

    // Recipient
    recipientName: '',
    recipientAddress: '',
    recipientPhone: '',
    addressReferences: '',
    
    // Detailed Address (UI only)
    addressStreet: '',
    addressNumber: '',
    addressCity: '', // Used for neighborhood

    zoneId: '',
  });

  useEffect(() => {
    if (token) {
      packageService.getZones(token)
        .then((data: any) => setZones(data))
        .catch(err => setError(err.message));
    }
  }, [token]);

  const geocodeAddress = async (address: string) => {
    try {
      // Simple geocoding using OpenStreetMap Nominatim
      // In production, use a more robust service or handle rate limits
      const query = encodeURIComponent(`${address}`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    } catch (e) {
      console.warn("Geocoding failed", e);
    }
    return { lat: null, lng: null };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!formData.zoneId) throw new Error("Por favor seleccione una zona");
      if (!formData.trackingCode) throw new Error("Código de seguimiento requerido");
      if (!formData.recipientName) throw new Error("Nombre del destinatario requerido");
      if (!formData.recipientAddress) throw new Error("Dirección de entrega requerida");
      
      // Auto-calculate coordinates
      const coords = await geocodeAddress(formData.recipientAddress);

      const payload = {
        ...formData,
        lat: coords.lat,
        lng: coords.lng,
        weight: null,
        volume: null
      };

      await packageService.createPackage(token!, payload);
      setSuccess(`¡Paquete ${formData.trackingCode} creado exitosamente!`);
      if (coords.lat) {
         console.log(`Geocoded to: ${coords.lat}, ${coords.lng}`);
      }

      // Reset form
      setFormData(prev => ({ 
        ...prev, 
        trackingCode: '', 
        senderName: '', senderAddress: '', senderPhone: '',
        recipientName: '', recipientAddress: '', recipientPhone: '', addressReferences: '',
        addressStreet: '', addressNumber: '', addressCity: ''
      }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateTracking = () => {
    const code = 'TRK-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    setFormData(prev => ({ ...prev, trackingCode: code }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="h-8 w-8 text-blue-500" />
            Nuevo Paquete
          </h1>
          <p className="text-slate-400 mt-1">Registrar un nuevo envío en el sistema con detalle completo.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Alerts */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl flex items-center gap-2">
            <AlertCircle className="h-5 w-5" /> {error}
          </div>
        )}
        {success && (
          <div className="p-4 bg-green-500/10 border border-green-500/20 text-green-500 rounded-xl flex items-center gap-2">
            <Package className="h-5 w-5" /> {success}
          </div>
        )}

        {/* Section 1: Identification & Route */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Box className="h-5 w-5 text-blue-400" /> Identificación del Paquete
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Código de Seguimiento</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="ej. TRK-123456789"
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                            value={formData.trackingCode}
                            onChange={e => setFormData({ ...formData, trackingCode: e.target.value })}
                        />
                        <button
                            type="button"
                            onClick={generateTracking}
                            className="px-3 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 text-sm font-medium transition-colors"
                        >
                            Generar
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Zona de Destino</label>
                    <select
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        value={formData.zoneId}
                        onChange={e => setFormData({ ...formData, zoneId: e.target.value })}
                        required
                    >
                        <option value="">Seleccione una Zona</option>
                        {zones.map((z: Zone) => (
                            <option key={z.id} value={z.id}>{z.name}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>

        {/* Section 2: Sender Details (New) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-orange-400" /> Datos del Remitente (Opcional)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Nombre / Empresa</label>
                    <input
                        type="text"
                        placeholder="ej. Logística Central"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-all"
                        value={formData.senderName}
                        onChange={e => setFormData({ ...formData, senderName: e.target.value })}
                    />
                </div>
                 <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Teléfono de Origen</label>
                    <div className="relative">
                        <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="ej. +54 11 ..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-all"
                            value={formData.senderPhone}
                            onChange={e => setFormData({ ...formData, senderPhone: e.target.value })}
                        />
                    </div>
                </div>
            </div>
             <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Dirección de Retiro / Origen</label>
                <div className="relative">
                    <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Calle, Altura, Ciudad"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-all"
                        value={formData.senderAddress}
                        onChange={e => setFormData({ ...formData, senderAddress: e.target.value })}
                    />
                </div>
            </div>
        </div>


        {/* Section 3: Recipient Details */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <User className="h-5 w-5 text-emerald-400" /> Datos del Destinatario
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Nombre Completo / Razón Social</label>
                    <input
                        type="text"
                        placeholder="ej. Juan Perez S.A."
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-all"
                        value={formData.recipientName}
                        onChange={e => setFormData({ ...formData, recipientName: e.target.value })}
                        required
                    />
                </div>
                 <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Teléfono</label>
                    <div className="relative">
                        <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="ej. +54 9 11 1234 5678"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-all"
                            value={formData.recipientPhone}
                            onChange={e => setFormData({ ...formData, recipientPhone: e.target.value })}
                            required
                        />
                    </div>
                </div>
            </div>

             <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-300">Dirección de Entrega</label>
                    <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">Geocodificación Automática</span>
                </div>
                
                {/* Structured Address Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Country & Province (Defaults) */}
                    <div className="space-y-2">
                         <label className="text-xs text-slate-500">País</label>
                         <input 
                            type="text" 
                            value="Argentina" 
                            disabled 
                            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-400 cursor-not-allowed"
                         />
                    </div>
                    <div className="space-y-2">
                         <label className="text-xs text-slate-500">Provincia</label>
                         <input 
                            type="text" 
                            value="Córdoba" 
                            disabled 
                            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-400 cursor-not-allowed"
                         />
                    </div>

                    {/* Neighborhood (Autocomplete) */}
                    <div className="space-y-2 md:col-span-1">
                         <label className="text-xs text-slate-300">Barrio (Córdoba Capital)</label>
                         <input
                            list="barrios-cordoba"
                            type="text"
                            placeholder="Seleccione o escriba..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-all"
                            value={formData.addressCity || ''} // Reusing addressCity for Neighborhood temporarily
                            onChange={e => {
                                const val = e.target.value;
                                setFormData(prev => ({ 
                                    ...prev, 
                                    addressCity: val,
                                    recipientAddress: `${prev.addressStreet || ''} ${prev.addressNumber || ''}, ${val}, Córdoba, Argentina`.trim()
                                }));
                            }}
                         />
                         <datalist id="barrios-cordoba">
                            {[
                                // Zona Centro y Nueva Córdoba
                                "Centro", "Nueva Córdoba", "Güemes", "Observatorio", "Alberdi", "Alto Alberdi", "Bajo Supremo",
                                // Norte
                                "Alta Córdoba", "Cofico", "General Bustos", "General Paz", "Juniors", "San Martín", 
                                "Villa Cabrera", "San Rafael", "Los Paraísos", "Barrio Poeta Lugones", "Cerro de las Rosas", 
                                "Urca", "Villa Belgrano", "Argüello", "Villa Warcalde", "Los Boulevares", "Parque Liceo",
                                // Sur
                                "Jardín", "Rogelio Martínez", "Crisol", "Maipú", "San Vicente", "Barrio Iponá", "San Fernando",
                                "Las Flores", "Villa El Libertador", "Santa Isabel", "Congreso", "Comercial",
                                // Oeste
                                "Sachi", "Carrara", "Manantiales", "Villa Urquiza", "Las Palmas", "Los Plátanos", "Consorcio Esperanza",
                                "Quebrada de las Rosas", "San Ignacio", "Villa Unión", "Parque República",
                                // Este
                                "Yapeyú", "Pueyrredón", "Talleres", "Patricios", "General Savio",
                                // Otros Populares
                                "Ciudad Universitaria", "Parque Sarmiento", "Maldonado", "Acosta", "Altamira", "Empalme",
                                "Ferreyra", "Ituzaingó", "José Ignacio Díaz", "Coronel Olmedo"
                            ].sort().map(b => <option key={b} value={b} />)}
                         </datalist>
                    </div>

                    {/* Street & Number */}
                    <div className="space-y-2 md:col-span-1">
                         <label className="text-xs text-slate-300">Calle y Altura</label>
                         <div className="flex gap-2">
                             <input
                                type="text"
                                placeholder="Calle"
                                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-all"
                                value={formData.addressStreet || ''}
                                onChange={e => {
                                    const val = e.target.value;
                                    setFormData(prev => ({ 
                                        ...prev, 
                                        addressStreet: val,
                                        recipientAddress: `${val} ${prev.addressNumber || ''}, ${prev.addressCity || ''}, Córdoba, Argentina`.trim()
                                    }));
                                }}
                             />
                             <input
                                type="text"
                                placeholder="N°"
                                className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-all"
                                value={formData.addressNumber || ''}
                                onChange={e => {
                                    const val = e.target.value;
                                    setFormData(prev => ({ 
                                        ...prev, 
                                        addressNumber: val,
                                        recipientAddress: `${prev.addressStreet || ''} ${val}, ${prev.addressCity || ''}, Córdoba, Argentina`.trim()
                                    }));
                                }}
                             />
                         </div>
                    </div>
                </div>

                {/* Full Address Preview (Readonly) */}
                <div className="relative pt-2">
                    <MapPin className="absolute left-3 top-5 h-4 w-4 text-slate-500" />
                    <label className="text-xs text-slate-500 mb-1 block">Dirección Completa (Generada)</label>
                    <input
                        type="text"
                        disabled
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-slate-300 font-mono text-sm"
                        value={formData.recipientAddress}
                    />
                </div>
            </div>

             <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Referencias (Crítico)</label>
                <input
                    type="text"
                    placeholder="ej. Portón negro, al lado del kiosco, tocar timbre fuerte"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-all"
                    value={formData.addressReferences}
                    onChange={e => setFormData({ ...formData, addressReferences: e.target.value })}
                />
            </div>
        </div>

        <div className="flex justify-end pt-4 gap-4">
            <button
              type="button"
              className="px-6 py-3 text-slate-400 hover:text-white transition-colors"
              onClick={() => setFormData({ 
                  trackingCode: '', 
                  senderName: '', senderAddress: '', senderPhone: '',
                  recipientName: '', recipientAddress: '', recipientPhone: '', 
                  addressReferences: '', zoneId: '',
                  addressStreet: '', addressNumber: '', addressCity: ''
              })}
            >
              Limpiar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg shadow-blue-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
            >
              {loading ? 'Procesando...' : (
                <>
                  <Plus className="h-5 w-5" />
                  Crear Paquete
                </>
              )}
            </button>
        </div>
      </form>
    </div>
  );
}
