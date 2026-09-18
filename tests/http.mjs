import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const token = 'a'.repeat(64);
const csrf = 'c'.repeat(64);

export async function testHttp(run) {
    const cases = [];

    const add = (name, route, status, options = {}) =>
        cases.push({ name, route, status, ...options });

    for (const route of [
        'index',
        'settings',
        'profile',
        'profile-delete',
        'blocked-users',
        'support',
        'terms',
        'privacy',
        'login',
        'password-lost',
        'password-reset',
        'email-verification-resend',
        'delete-account',
        'create-account',
        'create-account-campos'
    ]) {
        add(
            'GET ' + route,
            route,
            200,
            route === 'profile'
                ? { query: { target: A } }
                : route === 'login'
                    ? { query: { guest: '1' } }
                    : {}
        );
    }

    add('Notifications GET', 'notifications', 200, { success: true });

    add('Conversas GET', 'messages', 200, {
        query: { api: 'conversations' },
        success: true
    });

    add('Histórico GET', 'messages', 200, {
        query: { api: 'history', target: B },
        success: true
    });

    add('Hoje próprio', 'today', 200, { success: true });

    add('Hoje alheio sem acesso', 'today', 404, {
        query: { target: B, blocked: '1' }
    });

    for (const route of [
        'push-device',
        'background-location-token',
        'background-location-update',
        'websocket-token',
        'safety',
        'logout'
    ]) {
        add('Método recusado ' + route, route, 405);
    }

    add('Sem sessão push', 'push-device', 401, {
        method: 'POST',
        json: {},
        query: { guest: '1' }
    });

    add('CSRF em falta', 'push-device', 403, {
        method: 'POST',
        json: {},
        csrf: false
    });

    for (const platform of ['ios', 'android']) {
        add('Registar ' + platform, 'push-device', 200, {
            method: 'POST',
            success: true,
            json: {
                action: 'register',
                platform,
                token: platform === 'ios'
                    ? token
                    : 'FCM-token-com-comprimento-suficiente',
                installation_id: B
            }
        });
    }

    add('Token push inválido', 'push-device', 422, {
        method: 'POST',
        json: {
            platform: 'ios',
            token: 'invalid',
            installation_id: B
        }
    });

    add('Desregistar push', 'push-device', 200, {
        method: 'POST',
        json: { action: 'unregister', installation_id: B },
        success: true
    });

    add('Token de background', 'background-location-token', 200, {
        method: 'POST',
        success: true
    });

    add('Token WebSocket', 'websocket-token', 200, {
        method: 'POST',
        success: true
    });

    const location = {
        latitude: 38,
        longitude: -9,
        accuracy: 10,
        active: true,
        visible: true,
        app_state: 'background'
    };

    add('Atualização nativa bearer', 'background-location-update', 200, {
        method: 'POST',
        json: location,
        bearer: token,
        csrf: false,
        success: true
    });

    add('Atualização nativa token no corpo', 'background-location-update', 200, {
        method: 'POST',
        json: { ...location, token },
        csrf: false,
        success: true
    });

    add('Atualização sem token', 'background-location-update', 401, {
        method: 'POST',
        json: location,
        csrf: false
    });

    add('Token com propósito errado', 'background-location-update', 401, {
        method: 'POST',
        json: location,
        bearer: token,
        query: { purpose: 'websocket' }
    });

    add('Coordenadas inválidas', 'background-location-update', 400, {
        method: 'POST',
        json: { ...location, latitude: 91 },
        bearer: token
    });

    add('Estado sem coordenadas', 'background-location-update', 200, {
        method: 'POST',
        json: { state_only: true, app_state: 'foreground' },
        bearer: token,
        success: true
    });

    add('Invisível sem coordenadas', 'background-location-update', 200, {
        method: 'POST',
        json: { visible: false },
        bearer: token,
        success: true
    });

    add('JSON malformado', 'background-location-update', 400, {
        method: 'POST',
        raw: '{',
        bearer: token
    });

    const account = {
        primeiro_nome: 'Nova',
        ultimo_nome: 'Pessoa',
        dia: '10',
        mes: '5',
        ano: '1990',
        genero: 'P',
        email: 'nova@example.test',
        password: 'Senha1234',
        confirma_password: 'Senha1234',
        aceitou_termos: '1',
        aceitou_privacidade: '1'
    };

    add('Registar conta', 'create-account', 200, {
        method: 'POST',
        form: account,
        success: true,
        query: { guest: '1' }
    });

    add('Registo sem aceitar termos', 'create-account', 422, {
        method: 'POST',
        form: { ...account, aceitou_termos: '0' }
    });

    add('Registo de menor', 'create-account', 422, {
        method: 'POST',
        form: { ...account, ano: '2020' }
    });

    add('Editar só bio', 'create-account', 200, {
        method: 'POST',
        form: { modo: 'editar', secao: 'descricao', sobre_ti: 'Bio nova' },
        success: true
    });

    add('Editar sem sessão', 'create-account', 401, {
        method: 'POST',
        form: { modo: 'editar' },
        query: { guest: '1' }
    });

    add('Login válido', 'login', 302, {
        method: 'POST',
        query: { guest: '1' },
        form: {
            utilizador: 'pessoa0@example.test',
            palavra_passe: 'Senha1234'
        }
    });

    add('Login email pendente', 'login', 403, {
        method: 'POST',
        form: {
            utilizador: 'pessoa0@example.test',
            palavra_passe: 'Senha1234'
        },
        query: { unverified: '1', guest: '1' }
    });

    add('Confirmação de email', 'verify-email', 200, {
        query: {
            token,
            purpose: 'email_verification',
            unverified: '1'
        }
    });

    add('Recuperação de password', 'password-lost', 200, {
        method: 'POST',
        field: ['enviado', true],
        form: { email: 'pessoa0@example.test' }
    });

    add('Reset válido', 'password-reset', 200, {
        method: 'POST',
        field: ['concluido', true],
        query: { purpose: 'password_reset' },
        form: {
            token,
            nova_password: 'NovaSenha1234',
            confirmar_password: 'NovaSenha1234'
        }
    });

    add('Reset sem token', 'password-reset', 400, {
        method: 'POST',
        form: {
            nova_password: 'NovaSenha1234',
            confirmar_password: 'NovaSenha1234'
        }
    });

    add('Pedir eliminação', 'profile-delete', 200, {
        method: 'POST'
    });

    add('Eliminar conta com token', 'delete-account', 200, {
        method: 'POST',
        field: ['eliminado', true],
        query: { purpose: 'delete_account' },
        form: { token, confirmar_eliminacao: '1' }
    });

    add('Logout', 'logout', 303, { method: 'POST' });

    add('Enviar mensagem', 'messages', 201, {
        method: 'POST',
        query: { target: B },
        form: { mensagem: 'Olá' },
        success: true
    });

    add('Responder a mensagem', 'messages', 201, {
        method: 'POST',
        query: { target: B },
        form: { mensagem: 'Resposta', reply_to: '1' },
        success: true
    });

    add('Resposta inexistente', 'messages', 422, {
        method: 'POST',
        query: { target: B },
        form: { mensagem: 'Resposta', reply_to: '99999' }
    });

    add('Resposta inválida', 'messages', 422, {
        method: 'POST',
        query: { target: B },
        form: { mensagem: 'Resposta', reply_to: 'abc' }
    });

    add('Reação Unicode', 'messages', 200, {
        method: 'POST',
        query: { target: B },
        form: { action: 'react', message_id: '1', emoji: '👩🏽‍💻' },
        success: true
    });

    add('Reação inválida', 'messages', 422, {
        method: 'POST',
        query: { target: B },
        form: { action: 'react', message_id: '1', emoji: 'texto' }
    });

    add('Duas reações recusadas', 'messages', 422, {
        method: 'POST',
        query: { target: B },
        form: { action: 'react', message_id: '1', emoji: '❤️❤️' }
    });

    add('Tecla emoji', 'messages', 200, {
        method: 'POST',
        query: { target: B },
        form: { action: 'react', message_id: '1', emoji: '1️⃣' },
        success: true
    });

    const wav = Buffer.alloc(32044);

    wav.write('RIFF');
    wav.writeUInt32LE(32036, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(16000, 24);
    wav.writeUInt32LE(32000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(32000, 40);

    add('Upload áudio WAV', 'messages', 201, {
        method: 'POST',
        query: { target: B },
        form: { media_kind: 'audio' },
        upload: wav,
        success: true,
        messageType: 'audio'
    });

    add('Upload áudio inválido', 'messages', 422, {
        method: 'POST',
        query: { target: B },
        form: { media_kind: 'audio' },
        upload: Buffer.from('not-a-recording')
    });

    add('Mensagem vazia', 'messages', 422, {
        method: 'POST',
        query: { target: B },
        form: { mensagem: '' }
    });

    add('Mensagem sem sessão', 'messages', 401, {
        method: 'POST',
        query: { guest: '1', target: B },
        form: { mensagem: 'Olá' }
    });

    add('Mensagem bloqueada', 'messages', 404, {
        method: 'POST',
        query: { blocked: '1', target: B },
        form: { mensagem: 'Olá' }
    });

    add('Mensagem demasiado longa', 'messages', 422, {
        method: 'POST',
        query: { target: B },
        form: { mensagem: 'a'.repeat(2001) }
    });

    add('Marcar conversa lida', 'messages', 200, {
        method: 'POST',
        query: { target: B },
        form: { action: 'mark_read' },
        success: true
    });

    add('Apagar mensagem alheia', 'messages', 403, {
        method: 'POST',
        query: { target: B },
        form: { action: 'delete_message', message_id: '1' }
    });

    add('Bloquear', 'safety', 200, {
        method: 'POST',
        form: { action: 'block', target_id: B },
        success: true
    });

    add('Autobloqueio', 'safety', 422, {
        method: 'POST',
        form: { action: 'block', target_id: A }
    });

    add('Denunciar', 'safety', 200, {
        method: 'POST',
        form: { action: 'report', target_id: B, motivo: 'spam' },
        success: true
    });

    add('Desbloquear', 'blocked-users', 303, {
        method: 'POST',
        form: { action: 'unblock', target_id: B }
    });

    add('Ler Heys', 'notifications', 200, {
        method: 'POST',
        form: { action: 'mark_all_read' },
        success: true
    });

    add('Hoje guardar', 'today', 200, {
        method: 'POST',
        json: { note: 'Olá', clothes: [] },
        success: true
    });

    add('Hoje editar terceiro', 'today', 403, {
        method: 'POST',
        query: { target: B },
        json: { note: 'Alterar' }
    });

    add('Hoje apagar', 'today', 200, {
        method: 'DELETE',
        success: true
    });

    const failures = [];

    for (const [i, c] of cases.entries()) {
        const query = new URLSearchParams({
            route: c.route,
            ...c.query
        });

        const headers = {
            'X-Requested-With': 'XMLHttpRequest',
            Accept: 'application/json'
        };

        if (c.csrf !== false) headers['X-CSRF-Token'] = csrf;
        if (c.bearer) headers.Authorization = 'Bearer ' + c.bearer;

        let body;

        if (c.upload) {
            const multipart = new FormData();

            for (const [key, value] of Object.entries(c.form || {})) {
                multipart.set(key, value);
            }

            multipart.set(
                'media',
                new Blob([c.upload], { type: 'audio/wav' }),
                'voice.wav'
            );

            const encoded = new Request('http://localhost/', {
                method: 'POST',
                body: multipart
            });

            headers['Content-Type'] = encoded.headers.get('Content-Type');
            body = new Uint8Array(await encoded.arrayBuffer());
        } else if (c.json !== undefined || c.raw !== undefined) {
            headers['Content-Type'] = 'application/json';
            body = c.raw ?? JSON.stringify(c.json);
        } else if (c.form) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            body = new URLSearchParams(c.form).toString();
        }

        try {
            const r = await run({
                query: query.toString(),
                headers,
                body,
                method: c.method || 'GET',
                index: i
            });

            assert.equal(r.status, c.status, `${c.name}: ${r.text}`);

            if (c.success !== undefined) {
                assert.equal(JSON.parse(r.text).success, c.success, c.name);
            }

            if (c.messageType) {
                assert.equal(JSON.parse(r.text).message.tipo, c.messageType, c.name);
            }

            if (c.field) {
                assert.equal(
                    JSON.parse(r.text).data[c.field[0]],
                    c.field[1],
                    c.name
                );
            }

            assert.ok(!r.errors, c.name + ': ' + r.errors);
        } catch (error) {
            failures.push(error.message);
        }
    }

    assert.deepEqual(failures, [], failures.join('\n'));
    return cases.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const url = process.argv[2];

    if (!url) {
        throw Error('Indica o URL local de tests/http-fixture.php.');
    }

    const count = await testHttp(async req => {
        const r = await fetch(url + '?' + req.query, {
            method: req.method,
            headers: req.headers,
            body: req.body,
            redirect: 'manual'
        });

        return {
            status: r.status,
            text: await r.text()
        };
    });

    console.log(`OK: ${count} cenários HTTP isolados.`);
}