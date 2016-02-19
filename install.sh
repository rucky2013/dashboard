yum -y install libmysqlclient-dev python-dev python-pip python-virtualenv mysql-devel gcc
virtualenv ./env
./env/bin/pip install -r pip_requirements.txt -i http://pypi.douban.com/simple
