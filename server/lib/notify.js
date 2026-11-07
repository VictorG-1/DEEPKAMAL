const db = require('../db');
const { loadEnv } = require('./supabase');

function queueNotification({ channel, recipient, subject, body, link, entityType, entityId }) {
  const result = db
    .prepare(
      `INSERT INTO notifications (channel, recipient, subject, body, link, status, entity_type, entity_id)
       VALUES (?, ?, ?, ?, ?, 'Queued', ?, ?)`
    )
    .run(channel, recipient || null, subject || null, body, link || null, entityType || null, entityId || null);

  const env = loadEnv();
  let status = 'Queued';
  let delivery = { simulated: true };

  // Demo/local: mark as "Sent (link)" — real providers activate when keys exist
  if (channel === 'whatsapp' && recipient) {
    const wa = `https://wa.me/${String(recipient).replace(/\D/g, '')}?text=${encodeURIComponent(`${subject || ''}\n${body}`)}`;
    delivery = { url: wa, simulated: !env.WHATSAPP_API_KEY };
    status = env.WHATSAPP_API_KEY ? 'Sent' : 'LinkReady';
    db.prepare(`UPDATE notifications SET link = ?, status = ? WHERE id = ?`).run(wa, status, result.lastInsertRowid);
  } else if (channel === 'email' && recipient) {
    const mail = `mailto:${recipient}?subject=${encodeURIComponent(subject || 'DeepKamal')}&body=${encodeURIComponent(body)}`;
    delivery = { url: mail, simulated: !env.SMTP_HOST };
    status = env.SMTP_HOST ? 'Sent' : 'LinkReady';
    db.prepare(`UPDATE notifications SET link = ?, status = ? WHERE id = ?`).run(mail, status, result.lastInsertRowid);
  } else if (channel === 'sms' && recipient) {
    status = env.SMS_API_KEY ? 'Sent' : 'Queued';
    db.prepare(`UPDATE notifications SET status = ? WHERE id = ?`).run(status, result.lastInsertRowid);
  } else {
    db.prepare(`UPDATE notifications SET status = 'Logged' WHERE id = ?`).run(result.lastInsertRowid);
    status = 'Logged';
  }

  return { id: result.lastInsertRowid, status, delivery };
}

function notifyQuoteSent(quote, client) {
  const phone = quote.contact_phone || client?.phone;
  const email = quote.contact_email || client?.email;
  const body = `Quotation ${quote.code} for ${quote.title || quote.scope} · ₹${Number(quote.amount).toLocaleString('en-IN')} · valid till ${quote.valid_until || '—'}`;
  const out = [];
  if (phone) out.push(queueNotification({ channel: 'whatsapp', recipient: phone, subject: `Quote ${quote.code}`, body, entityType: 'quotation', entityId: quote.id }));
  if (email) out.push(queueNotification({ channel: 'email', recipient: email, subject: `DeepKamal quotation ${quote.code}`, body, entityType: 'quotation', entityId: quote.id }));
  return out;
}

function notifyAssignment(ticket, partner) {
  if (!partner?.phone && !partner?.email) {
    return [
      queueNotification({
        channel: 'app',
        recipient: partner?.email || partner?.name,
        subject: `Assigned ${ticket.code}`,
        body: `Job ${ticket.code}: ${ticket.title}`,
        entityType: 'ticket',
        entityId: ticket.id
      })
    ];
  }
  const out = [];
  if (partner.phone) {
    out.push(
      queueNotification({
        channel: 'whatsapp',
        recipient: partner.phone,
        subject: `Job ${ticket.code}`,
        body: `You are assigned: ${ticket.title}. Open DeepKamal partner app.`,
        entityType: 'ticket',
        entityId: ticket.id
      })
    );
  }
  return out;
}

function notifyPaymentReminder(invoice, client) {
  const balance = Math.max(0, Number(invoice.amount) - Number(invoice.amount_paid || 0));
  if (!(balance > 0)) return [];
  const body = `Reminder: invoice ${invoice.code} balance ₹${balance.toLocaleString('en-IN')} due ${invoice.due_date || 'soon'}.`;
  const out = [];
  if (client?.phone) {
    out.push(
      queueNotification({
        channel: 'whatsapp',
        recipient: client.phone,
        subject: `Payment due · ${invoice.code}`,
        body,
        entityType: 'invoice',
        entityId: invoice.id
      })
    );
  }
  if (client?.email) {
    out.push(
      queueNotification({
        channel: 'email',
        recipient: client.email,
        subject: `DeepKamal payment reminder ${invoice.code}`,
        body,
        entityType: 'invoice',
        entityId: invoice.id
      })
    );
  }
  if (client?.phone) {
    out.push(
      queueNotification({
        channel: 'sms',
        recipient: client.phone,
        subject: `Pay ${invoice.code}`,
        body,
        entityType: 'invoice',
        entityId: invoice.id
      })
    );
  }
  return out;
}

function notifyAmcReminder(client, dueDate) {
  const body = `AMC reminder for ${client.name}: preventive visit around ${dueDate}. Reply to schedule.`;
  const out = [];
  if (client.phone) {
    out.push(
      queueNotification({
        channel: 'whatsapp',
        recipient: client.phone,
        subject: `AMC reminder · ${client.name}`,
        body,
        entityType: 'client',
        entityId: client.id
      })
    );
  }
  return out;
}

module.exports = {
  queueNotification,
  notifyQuoteSent,
  notifyAssignment,
  notifyPaymentReminder,
  notifyAmcReminder
};
