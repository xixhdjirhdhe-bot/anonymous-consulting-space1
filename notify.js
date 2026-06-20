// ไฟล์: api/notify.js
export default async function handler(req, res) {
    // อนุญาตเฉพาะการส่งข้อมูลแบบ POST
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    // รับข้อความที่ส่งมาจากหน้าเว็บ
    const { message } = req.body;
    
    // นำ Token ที่คัดลอกมาจากเว็บ LINE Notify มาวางในเครื่องหมายคำพูดด้านล่างนี้
    const LINE_TOKEN = 'OwQnZfP78CucoDsReSFMOZroVrlwhhyKokJ3hY67OnHYHbKErQ3nzm6hBrjC1J0h4CqAoDN5uMlH0YKlxH1vQrRVikFa2p0lN0V581ENNvNfpPTQ+Gyz9RUYsXHYB6+pR1PJ46PXulbTJU9gf3S21AdB04t89/1O/w1cDnyilFU=';

    try {
        const response = await fetch('https://notify-api.line.me/api/notify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${LINE_TOKEN}`
            },
            body: new URLSearchParams({ message: message })
        });

        if (response.ok) {
            res.status(200).json({ success: true });
        } else {
            res.status(response.status).json({ error: 'Failed to send to LINE' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
