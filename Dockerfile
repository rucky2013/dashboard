FROM private-registry.sohucs.com/sohucs/base-rh7:1.0

COPY dockerize /usr/local/bin/dockerize
COPY . /home/dashboard
WORKDIR /home/dashboard
RUN sh install.sh
EXPOSE 8080
CMD ["dockerize", "-template", "rrd/config.py.template:rrd/config.py", "sh", "run.sh"]
