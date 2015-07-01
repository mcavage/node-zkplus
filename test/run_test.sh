#!/bin/bash

echo "[+] Scanning localhost (zookeeper server is running ?)"
nc -z localhost 2181
if [ $? -ne 0 ]; then
  echo -n "[?] Zookeeper server not found, would like start zookeeper from docker [y/n]?"
  read ask_docker
  if [ $ask_docker == "y" ]; then
    echo "[+] Starting zookeeper from docker image (jplock/zookeeper)"
    ID=$(docker run -d -p 2181:2181 -p 2888:2888 -p 3888:3888 jplock/zookeeper)
    sleep 3
    echo "[!] zookeeper server is running"
    ./node_modules/.bin/nodeunit ./test/*.test.js
    echo "[!] test done, cleaning..."
    docker kill $ID
    exit 0
  fi
fi
./node_modules/.bin/nodeunit ./test/*.test.js
