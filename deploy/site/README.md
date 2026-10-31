# runtrovert.app on our own server

The site runs in one small container (nginx, read-only, 64 MB) next to whatever else
is on the server. Only Apache on the host faces the internet.

```
internet ─▶ Apache :443 (cert, redirects, HSTS) ─▶ 127.0.0.1:8085 ─▶ runtrovert-site container ─▶ site/ (read-only)
```

## First install (as root)

Our server's Apache is managed by DirectAdmin and binds every site to the server's IPs,
so the vhost names them (46.19.33.37 and 2a02:2770::21a:4aff:fe41:77b9) and is pulled in
with an Include, the same way as the other hand-added sites there.

```sh
git clone https://github.com/yigini/runtrovert /opt/runtrovert
cd /opt/runtrovert/deploy/site && docker compose up -d
curl -sI http://127.0.0.1:8085/ | head -1          # 200

# 1. Port-80 part first, so certbot can answer its check. Comment out the :443 block for now.
mkdir -p /var/www/letsencrypt/.well-known/acme-challenge
cp apache-runtrovert.app.conf /etc/httpd/conf/extra/httpd-runtrovert.conf
cp /etc/httpd/conf/extra/httpd-includes.conf /etc/httpd/conf/extra/httpd-includes.conf.bak
echo 'Include /etc/httpd/conf/extra/httpd-runtrovert.conf' >> /etc/httpd/conf/extra/httpd-includes.conf
httpd -t && systemctl reload httpd

# 2. Certificate (webroot). A first run on a fresh server also needs --email and --agree-tos,
#    and a person should read and accept Let's Encrypt's terms.
certbot certonly --webroot -w /var/www/letsencrypt -d runtrovert.app -d www.runtrovert.app --key-type ecdsa --non-interactive

# 3. Put the :443 block back, then
httpd -t && systemctl reload httpd
```

certbot-renew.timer renews the certificate. Any other server: change the IPs in the
VirtualHost lines and the paths to match its Apache layout.

## Access log: 14 days

privacy.html says each day's access log is deleted after 14 days. The container logs no
visits (`access_log off`); the host's Apache logs them to `/var/log/httpd/runtrovert_*.log`.
Install the rotation once, as root:

    cp /opt/runtrovert/deploy/site/logrotate-runtrovert /etc/logrotate.d/runtrovert
    logrotate -d /etc/logrotate.d/runtrovert   # dry run: no errors, no "duplicate log entry"

If the dry run says another logrotate file already covers those paths (DirectAdmin's own
`/etc/logrotate.d/httpd` with a `/var/log/httpd/*log` glob), don't install this file; set
that file's retention to 14 days or less instead, or leave it and tell us what it keeps.

## Updating

Merge to main. Within 10 minutes `update.sh` pulls the repo and the container serves the
new files. Nothing to build, no secrets: the repo is public and the server only reads it.

## Removing

`docker compose down` here, remove the Include line and httpd-runtrovert.conf, reload Apache, delete /opt/runtrovert
and the cron line. Nothing else on the server is touched.
