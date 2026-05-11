import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Resend } from 'resend';
import { gerarHtmlEmailPedido, gerarHtmlCodigoPerfil } from './emailTemplate.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY não foi definida no arquivo .env');
}

if (!process.env.EMAIL_FROM) {
  throw new Error('EMAIL_FROM não foi definido no arquivo .env');
}

const resend = new Resend(process.env.RESEND_API_KEY);
const codigosPerfil = new Map();

app.use(
  cors({
    origin: true,
  })
);
app.use(express.json());

function validarPedido(body) {
  const { nomeCliente, emailCliente, numeroPedido, itens, total } = body;

  if (!nomeCliente || !emailCliente || !numeroPedido) {
    return 'Dados principais do pedido estão faltando.';
  }

  if (!Array.isArray(itens) || itens.length === 0) {
    return 'O pedido precisa ter pelo menos 1 item.';
  }

  if (typeof total !== 'number' || Number.isNaN(total)) {
    return 'O total do pedido é inválido.';
  }

  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailValido.test(emailCliente)) {
    return 'O e-mail do cliente é inválido.';
  }

  for (const item of itens) {
    if (
      !item ||
      typeof item.nome !== 'string' ||
      typeof item.qtd !== 'number' ||
      typeof item.preco !== 'number'
    ) {
      return 'Há itens inválidos no pedido.';
    }
  }

  return null;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'Servidor do SnapBite online.' });
});

app.post('/api/enviar-email-pedido', async (req, res) => {
  try {
    const erroValidacao = validarPedido(req.body);

    if (erroValidacao) {
      return res.status(400).json({ ok: false, erro: erroValidacao });
    }

    const { nomeCliente, emailCliente, numeroPedido, itens, total } = req.body;

    const html = gerarHtmlEmailPedido({
      nomeCliente,
      numeroPedido,
      itens,
      total,
      imagemLoja: 'img/sua-imagem-aqui.png',
    });

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [emailCliente],
      subject: `Seu pedido ${numeroPedido} foi concluído com sucesso!`,
      html,
    });

    if (error) {
      console.error('Erro Resend:', error);
      return res.status(500).json({
        ok: false,
        erro: 'Falha ao enviar o e-mail.',
      });
    }

    return res.json({
      ok: true,
      messageId: data?.id || null,
    });
  } catch (err) {
    console.error('Erro interno:', err);
    return res.status(500).json({
      ok: false,
      erro: 'Erro interno no servidor.',
    });
  }
});



// ─────────────────────────────────────────────────────
// Código por e-mail para alterações sensíveis do perfil
// ─────────────────────────────────────────────────────
app.post('/api/enviar-codigo-perfil', async (req, res) => {
  try {
    const { email, nome } = req.body;
    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || !emailValido.test(email)) {
      return res.status(400).json({ ok: false, erro: 'E-mail inválido.' });
    }

    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const chave = String(email).toLowerCase();

    codigosPerfil.set(chave, {
      codigo,
      expiraEm: Date.now() + 10 * 60 * 1000,
      tentativas: 0,
    });

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [email],
      subject: 'Seu código de segurança SnapBite',
      html: gerarHtmlCodigoPerfil({ nomeCliente: nome || 'estudante', codigo }),
    });

    if (error) {
      console.error('Erro Resend código perfil:', error);
      return res.status(500).json({ ok: false, erro: 'Falha ao enviar o código.' });
    }

    return res.json({ ok: true, messageId: data?.id || null });
  } catch (err) {
    console.error('Erro ao enviar código perfil:', err);
    return res.status(500).json({ ok: false, erro: 'Erro interno ao enviar código.' });
  }
});

app.post('/api/verificar-codigo-perfil', (req, res) => {
  const { email, codigo } = req.body;
  const chave = String(email || '').toLowerCase();
  const registro = codigosPerfil.get(chave);

  if (!registro) {
    return res.status(400).json({ ok: false, erro: 'Solicite um novo código.' });
  }

  if (Date.now() > registro.expiraEm) {
    codigosPerfil.delete(chave);
    return res.status(400).json({ ok: false, erro: 'Código expirado. Solicite outro.' });
  }

  registro.tentativas += 1;
  if (registro.tentativas > 5) {
    codigosPerfil.delete(chave);
    return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Solicite outro código.' });
  }

  if (String(codigo || '').trim() !== registro.codigo) {
    return res.status(400).json({ ok: false, erro: 'Código incorreto.' });
  }

  codigosPerfil.delete(chave);
  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────
// Registrar interesse no SnapBite App
// ─────────────────────────────────────────────────────
app.post('/api/registrar-interesse-app', async (req, res) => {
  try {
    const { nome, email } = req.body;

    if (!nome || !email) {
      return res.status(400).json({
        ok: false,
        erro: 'Nome e email são obrigatórios.',
      });
    }

    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailValido.test(email)) {
      return res.status(400).json({
        ok: false,
        erro: 'Email inválido.',
      });
    }

    // Enviar email de confirmação
    const htmlConfirmacao = `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>SnapBite App - Notificação Confirmada</title>
        </head>
        <body style="margin:0;padding:0;background:#FDFAF4;font-family:Arial,Helvetica,sans-serif;color:#1C1410;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDFAF4;padding:32px 16px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #EAE0CC;">
                  <tr>
                    <td style="background:#2D2420;padding:28px 32px;text-align:center;">
                      <div style="font-size:28px;font-weight:800;color:#C8952A;margin-bottom:6px;">SnapBite</div>
                      <div style="font-size:14px;color:#d4c4a8;">
                        Notificação Confirmada! 🎉
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:32px;">
                      <p style="margin:0 0 12px;font-size:16px;">
                        Olá, <strong>${String(nome).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</strong>!
                      </p>

                      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#4A3E38;">
                        Muito obrigado! Você está na fila de espera para o SnapBite App. Assim que a versão para iOS e Android estiver disponível, enviaremos um email avisando para você ser um dos primeiros a testar. 🚀
                      </p>

                      <div style="background:#F5EFE0;border:1px solid #EAE0CC;border-radius:14px;padding:18px 20px;margin-bottom:24px;">
                        <h3 style="margin:0 0 12px;color:#1C1410;">O que esperar:</h3>
                        <ul style="margin:0;padding-left:20px;color:#4A3E38;line-height:1.7;">
                          <li>✅ Notificações em tempo real do seu pedido</li>
                          <li>📋 Histórico de todos os seus pedidos</li>
                          <li>🎁 Promoções exclusivas para usuários do app</li>
                          <li>⚡ Pedido mais rápido e inteligente</li>
                        </ul>
                      </div>

                      <p style="margin:0;font-size:13px;line-height:1.7;color:#8C8070;">
                        Enquanto isso, continue usando o site do SnapBite para fazer seus pedidos. A experiência será ainda melhor quando o app chegar!
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="background:#2D2420;padding:18px 24px;text-align:center;">
                      <div style="font-size:12px;color:#A09080;">
                        © SnapBite • Feito por estudantes do SENAI
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [email],
      subject: 'SnapBite App — Notificação Confirmada! 🚀',
      html: htmlConfirmacao,
    });

    if (error) {
      console.error('Erro ao enviar email de confirmação:', error);
      // Mesmo com erro no email, retorna sucesso pois o registro foi feito
      return res.json({
        ok: true,
        messageId: null,
        aviso: 'Interesse registrado, mas houve um erro ao enviar o email de confirmação.',
      });
    }

    return res.json({
      ok: true,
      messageId: data?.id || null,
    });
  } catch (err) {
    console.error('Erro ao registrar interesse:', err);
    return res.status(500).json({
      ok: false,
      erro: 'Erro ao registrar seu interesse. Tente novamente mais tarde.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
