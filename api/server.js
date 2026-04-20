const express = require('express');
const cors = require('cors');
const { Client } = require('ssh2');
const { NodeSSH } = require('node-ssh');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..'))); // serve frontend

// ── SSE HELPER ──
function sseWrite(res, type, data) {
  res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
}

// ═══════════════════════════════════════════
// POST /api/install  — Main panel installer
// ═══════════════════════════════════════════
app.post('/api/install', async (req, res) => {
  const { ipvps, password, domainPanel, domainNode, ramvps, ipAlias, portType } = req.body;

  if (!ipvps || !password || !domainPanel || !domainNode || !ramvps) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const log = (msg) => sseWrite(res, 'log', { message: msg });
  const step = (msg, pct) => { sseWrite(res, 'step', { message: msg }); sseWrite(res, 'progress', { pct, label: msg }); };
  const success = (msg) => sseWrite(res, 'success', { message: msg });
  const fail = (msg) => { sseWrite(res, 'failed', { message: msg }); res.end(); };

  const allocAlias = ipAlias || domainNode;

  // ── SSH connection ──
  const conn = new Client();

  const connTimeout = setTimeout(() => {
    fail('SSH connection timed out (30s). Check IP and credentials.');
    conn.end();
  }, 30000);

  conn.on('error', (err) => {
    clearTimeout(connTimeout);
    fail('SSH error: ' + err.message);
  });

  conn.on('ready', () => {
    clearTimeout(connTimeout);
    success('SSH connection established');
    runInstall(conn);
  });

  conn.connect({
    host: ipvps,
    port: 22,
    username: 'root',
    password: password,
    readyTimeout: 30000
  });

  async function execCmd(conn, cmd) {
    return new Promise((resolve, reject) => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let out = '';
        stream.on('data', d => out += d.toString());
        stream.stderr.on('data', d => out += d.toString());
        stream.on('close', (code) => {
          if (code !== 0) reject(new Error(out.trim() || 'Command failed with code ' + code));
          else resolve(out.trim());
        });
      });
    });
  }

  function execStream(conn, cmd, onData, inputs) {
    return new Promise((resolve, reject) => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let buf = '';
        let inputSent = {};

        stream.on('data', (data) => {
          const str = data.toString();
          buf += str;
          if (onData) onData(str);

          if (inputs) {
            for (const [trigger, response, key] of inputs) {
              if (!inputSent[key] && buf.includes(trigger)) {
                inputSent[key] = true;
                setTimeout(() => stream.write(response), 200);
              }
            }
          }
        });

        stream.stderr.on('data', (data) => {
          const s = data.toString();
          buf += s;
          if (onData) onData('[stderr] ' + s);
        });

        stream.on('close', (code) => {
          if (code === 0 || code === null) resolve(buf);
          else reject(new Error('Process exited with code ' + code));
        });
      });
    });
  }

  async function runInstall(conn) {
    try {
      // ── Step 1: Install Panel ──
      step('Installing Pterodactyl Panel', 8);
      log('Running pterodactyl-installer.se for panel...');

      const panelCmd = 'bash <(curl -s https://pterodactyl-installer.se)';
      const panelInputs = [
        ['Input 0', '0\n', 'menu_select'],
        ['\n\n', '\n', 'blank1'],
        ['1248\n', '1248\n', 'port'],
        ['Asia/Jakarta\n', 'Asia/Jakarta\n', 'tz'],
        ['admin@gmail.com\n', 'admin@gmail.com\n', 'email1'],
        ['admin@gmail.com\n', 'admin@gmail.com\n', 'email2'],
        ['admin\n', 'admin\n', 'uname'],
        ['admin\n', 'admin\n', 'fname'],
        ['admin\n', 'admin\n', 'lname'],
        ['admin\n', 'admin\n', 'pass'],
        [`${domainPanel}\n`, `${domainPanel}\n`, 'domain'],
        ['y\ny\ny\ny\ny\n\n1\n', 'y\ny\ny\ny\ny\n\n1\n', 'confirms'],
        ['Select the appropriate number', '1\n', 'ssl_num'],
        ['Still assume SSL', 'y\n', 'ssl_assume'],
        ["Please read the Terms of Service", 'y\n', 'tos'],
      ];

      await execStream(conn, panelCmd,
        (chunk) => log(chunk.replace(/\n/g, ' ').trim()),
        panelInputs
      );
      success('Panel installed!');
      step('Installing Wings daemon', 35);

      // ── Step 2: Install Wings ──
      log('Running pterodactyl-installer.se for wings...');
      const wingsInputs = [
        ['Input', '1\ny\ny\ny\n', 'initial'],
        [`${domainPanel}\n`, `${domainPanel}\n`, 'panel_domain'],
        ['y\nuser\n1248\ny\n', 'y\nuser\n1248\ny\n', 'wings_cfg'],
        [`${domainNode}\n`, `${domainNode}\n`, 'node_domain'],
        ['y\nadmin@gmail.com\ny\n', 'y\nadmin@gmail.com\ny\n', 'wings_confirms'],
        ["automatically configure HTTPS", 'y\n', 'https_auto'],
        ["I agree that this HTTPS", 'y\n', 'https_agree'],
        ["DNS record", 'y\n', 'dns_mismatch'],
        ["Proceed anyways", 'y\n', 'proceed'],
        ["Proceed with installation", 'y\n', 'final'],
      ];

      await execStream(conn, panelCmd,
        (chunk) => log(chunk.replace(/\n/g, ' ').trim()),
        wingsInputs
      );
      success('Wings installed!');
      step('Creating node & location via panel API', 60);

      // ── Step 3: Get panel API token ──
      log('Fetching panel application API key...');
      await new Promise(r => setTimeout(r, 5000)); // wait panel fully up

      const apiKeyResult = await execCmd(conn,
        `cd /var/www/pterodactyl && php artisan p:api:key --user=1 --type=application --description="installer" --read-all --write-all 2>&1 | tail -5`
      );
      log('API key result: ' + apiKeyResult);

      // Create location via artisan/MySQL
      step('Creating default location', 68);
      await execCmd(conn,
        `mysql -u root panel -e "INSERT IGNORE INTO locations (short, long, created_at, updated_at) VALUES ('default', 'Default Location', NOW(), NOW());" 2>&1`
      );
      success('Location created');

      // Create node via panel artisan
      step('Creating node', 72);
      const createNodeCmd = `cd /var/www/pterodactyl && php artisan tinker --execute="
        \\\\Pterodactyl\\\\Models\\\\Node::create([
          'name' => 'NODES',
          'description' => 'Auto configured node',
          'location_id' => 1,
          'public' => true,
          'fqdn' => '${domainNode}',
          'scheme' => 'https',
          'behind_proxy' => false,
          'maintenance_mode' => false,
          'memory' => ${ramvps},
          'memory_overallocate' => 0,
          'disk' => ${ramvps},
          'disk_overallocate' => 0,
          'upload_size' => 100,
          'daemon_sftp' => 2022,
          'daemon_listen' => 8080,
        ]);" 2>&1`;
      await execCmd(conn, createNodeCmd);
      success('Node created');

      // ── Step 4: Configure Wings ──
      step('Generating Wings config & starting service', 78);
      const wingsCfgCmd = `
        cd /var/www/pterodactyl && \
        php artisan p:node:configuration 1 > /etc/pterodactyl/config.yml && \
        chmod 600 /etc/pterodactyl/config.yml && \
        systemctl enable wings --now && \
        sleep 5 && systemctl restart wings && \
        sleep 8 && systemctl is-active wings
      `;
      const wingStatus = await execCmd(conn, wingsCfgCmd);
      if (wingStatus.trim() === 'active') {
        success('Wings is ACTIVE ✓');
      } else {
        log('Wings status: ' + wingStatus);
        sseWrite(res, 'warn', { message: 'Wings may not be active — check manually' });
      }

      // ── Step 5: Create allocations ──
      step(`Creating port allocations (${portType === 'minecraft' ? '19110-20000' : '2000-5000'})`, 88);

      let allocSQL;
      if (portType === 'minecraft') {
        allocSQL = `mysql -u root panel -e "SET @node_id = (SELECT id FROM nodes LIMIT 1); INSERT IGNORE INTO allocations (node_id, ip, ip_alias, port, created_at, updated_at) SELECT @node_id, '0.0.0.0', '${allocAlias}', seq, NOW(), NOW() FROM (SELECT (a.N + b.N * 10 + c.N * 100 + 19110) AS seq FROM (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a, (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b, (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) c HAVING seq <= 20000) ports WHERE @node_id IS NOT NULL;" 2>&1`;
      } else {
        allocSQL = `mysql -u root panel -e "SET @node_id = (SELECT id FROM nodes LIMIT 1); INSERT IGNORE INTO allocations (node_id, ip, ip_alias, port, created_at, updated_at) SELECT @node_id, '0.0.0.0', '${allocAlias}', seq, NOW(), NOW() FROM (SELECT (a.N + b.N * 10 + c.N * 100 + d.N * 1000 + 2000) AS seq FROM (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a, (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b, (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) c, (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3) d HAVING seq <= 5000) ports WHERE @node_id IS NOT NULL;" 2>&1`;
      }

      const allocOut = await execCmd(conn, allocSQL);
      if (allocOut.includes('ERROR')) {
        sseWrite(res, 'warn', { message: 'Allocation warning: ' + allocOut.trim() });
      } else {
        success('Allocations created');
      }

      // ── DONE ──
      step('Finalizing...', 96);
      conn.end();

      sseWrite(res, 'done', {
        message: 'Installation complete',
        data: { ipvps, domainPanel, domainNode, portType, allocAlias }
      });
      res.end();

    } catch (err) {
      console.error('[Install Error]', err);
      conn.end();
      fail('Installation error: ' + err.message);
    }
  }
});

// ═══════════════════════════════════
// POST /api/swings  — Start Wings
// ═══════════════════════════════════
app.post('/api/swings', async (req, res) => {
  const { ipvps, password, token } = req.body;
  if (!ipvps || !password || !token) return res.status(400).json({ error: 'Missing fields' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const log = (msg) => sseWrite(res, 'log', { message: msg });

  const conn = new Client();

  conn.on('error', (err) => {
    sseWrite(res, 'error', { message: 'SSH error: ' + err.message });
    res.end();
  });

  conn.on('ready', () => {
    log('SSH connected to ' + ipvps);

    // Write token to config and restart wings
    const cmd = `
      echo "${token}" | base64 -d > /etc/pterodactyl/config.yml 2>/dev/null || \
      (mkdir -p /etc/pterodactyl && cat > /etc/pterodactyl/config.yml << 'EOFTOKEN'
${token}
EOFTOKEN
      ) ; \
      systemctl enable wings --now 2>&1; \
      sleep 3; \
      systemctl restart wings 2>&1; \
      sleep 5; \
      systemctl is-active wings
    `;

    conn.exec(cmd, (err, stream) => {
      if (err) {
        sseWrite(res, 'error', { message: err.message });
        res.end();
        conn.end();
        return;
      }

      stream.on('data', (d) => log(d.toString().trim()));
      stream.stderr.on('data', (d) => log('[err] ' + d.toString().trim()));
      stream.on('close', (code) => {
        if (code === 0) sseWrite(res, 'done', { message: 'Wings started' });
        else sseWrite(res, 'error', { message: 'Wings start may have failed. Exit code: ' + code });
        conn.end();
        res.end();
      });
    });
  });

  conn.connect({ host: ipvps, port: 22, username: 'root', password, readyTimeout: 20000 });
});

// ── START ──
app.listen(PORT, () => {
  console.log(`\n┌─────────────────────────────┐`);
  console.log(`│  NEXORA Backend             │`);
  console.log(`│  http://localhost:${PORT}      │`);
  console.log(`└─────────────────────────────┘\n`);
});
