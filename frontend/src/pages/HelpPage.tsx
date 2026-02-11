
import { HelpCircle, MessageCircle, FileText, Book } from 'lucide-react';

export function HelpPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center py-8">
        <h1 className="text-3xl font-bold text-white mb-2">¿Cómo podemos ayudarte?</h1>
        <p className="text-slate-400">Encuentra guías, tutoriales y soporte para el sistema de despacho.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { title: 'Documentación', icon: Book, desc: 'Guías detalladas sobre el uso de la plataforma.', color: 'text-blue-400', link: 'Ir a Docs' },
          { title: 'Soporte Técnico', icon: MessageCircle, desc: 'Contacta con nuestro equipo de soporte 24/7.', color: 'text-green-400', link: 'Chat en Vivo' },
          { title: 'Reportar Error', icon: FileText, desc: 'Avísanos si encuentras algún problema.', color: 'text-red-400', link: 'Crear Ticket' },
        ].map((item, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:border-slate-700 transition-colors group cursor-pointer">
            <item.icon className={`h-8 w-8 ${item.color} mb-4 group-hover:scale-110 transition-transform`} />
            <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
            <p className="text-sm text-slate-500 mb-4">{item.desc}</p>
            <span className="text-sm font-medium text-slate-300 group-hover:text-white flex items-center gap-1">
              {item.link} 
            </span>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <HelpCircle className="text-slate-400" /> 
            Preguntas Frecuentes
        </h2>
        <div className="space-y-4">
            {[
                { q: '¿Cómo asigno un conductor a una zona?', a: 'Ve a la página de "Centro de Despacho", arrastra la zona deseada desde la lista izquierda y suéltala sobre la tarjeta del conductor.' },
                { q: '¿Los conductores necesitan la app abierta siempre?', a: 'Sí, para el seguimiento en tiempo real, la aplicación debe estar activa o en segundo plano con permisos de ubicación habilitados.' },
                { q: '¿Cómo creo una cuenta de despachador?', a: 'Solo los administradores pueden crear cuentas de despachador desde el botón "Nuevo Despacho" en la barra superior. (Nota: Esto es lo que acabamos de implementar).' },
                { q: '¿Puedo exportar los reportes?', a: 'Actualmente la función de exportación está en desarrollo y estará disponible en la próxima actualización v1.2.' }
            ].map((faq, i) => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                    <h3 className="font-bold text-slate-200 mb-2">{faq.q}</h3>
                    <p className="text-sm text-slate-400">{faq.a}</p>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}
