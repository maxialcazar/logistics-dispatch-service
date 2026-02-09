
async function restoreAdmin() {
    try {
        console.log("Starting Restore...");
        const payload = {
            companyName: 'Logistica Central',
            companySlug: 'logistica-central', 
            username: 'adminA',
            password: '123456'
        };

        const res = await fetch('http://127.0.0.1:3010/api/auth/register-company', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            console.log("✅ Admin Restaurado: adminA / 123456");
        } else if (res.status === 409) {
             console.log("⚠️ El admin ya existe.");
        } else {
             const txt = await res.text();
             console.log("❌ Error:", res.status, txt);
        }
    } catch (e) {
        console.error("Fetch Error:", e);
    }
}
restoreAdmin();
