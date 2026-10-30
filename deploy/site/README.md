# runtrovert.app on our own server

The site runs in one small container (nginx, read-only, 64 MB) next to whatever else
is on the server. Only Apache on the host faces the internet.

```
internet ─▶ Apache :443 (cert, redirects, HSTS) ─▶ 127.0.0.1:8085 ─▶ runtrovert-site container ─▶ site/ (read-only)
```

## First install (as root)

```sh
git clone --depth 1 https://github.com/yigini/runtrovert /opt/runtrovert
cd /opt/runtrovert/deploy/site && docker compose up -d
curl -sI http://127.0.0.1:8085/ | head -1          # 200

cp apache-runtrovert.app.conf /etc/apache2/sites-available/runtrovert.app.conf   # Debian/Ubuntu layout
a2enmod proxy proxy_http headers rewrite ssl && a2ensite runtrovert.app
apachectl configtest && systemctl reload apache2
certbot --apache -d runtrovert.app -d www.runtrovert.app
(crontab -l; echo '*/10 * * * * /opt/runtrovert/deploy/site/update.sh >/dev/null 2>&1') | crontab -
```

On RHEL-style servers the file goes in /etc/httpd/conf.d/ and the service is httpd.

## Updating

Merge to main. Within 10 minutes `update.sh` pulls the repo and the container serves the
new files. Nothing to build, no secrets: the repo is public and the server only reads it.

## Removing

`docker compose down` here, `a2dissite runtrovert.app`, reload Apache, delete /opt/runtrovert
and the cron line. Nothing else on the server is touched.
