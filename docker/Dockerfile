FROM node:8-alpine

#RUN apk add --update \
#    python \
#    py-pip \
#    bash \
#    postgresql-dev \
#    alpine-sdk \
#    bash-completion \
#    screen \
#  && pip install --upgrade pip \
#  && pip install awscli \
#  && rm -rf /var/cache/apk/* 

WORKDIR /tmp
copy . /tmp

RUN npm install

CMD ["/usr/local/bin/node","run.js"]
