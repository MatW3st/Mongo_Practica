# Mongo_Practica
 Proyecto de mongoBD

Manual Completo: Aplicación de Gestión de MongoDB
1. Introducción
Este manual documenta el desarrollo de una aplicación web para la gestión de bases de datos MongoDB. La aplicación permite realizar operaciones CRUD sobre datos, gestionar bases de datos y colecciones, crear usuarios, realizar backups y restauraciones, y exportar/importar datos. La aplicación está construida con Node.js, Express, y MongoDB, y utiliza Docker para ejecutar MongoDB en un contenedor.

Objetivos
Proporcionar una interfaz web para gestionar bases de datos MongoDB.
Permitir la creación, edición y eliminación de datos en una colección.
Gestionar bases de datos y colecciones (crear y eliminar).
Crear usuarios con roles específicos.
Realizar backups y restauraciones de bases de datos.
Exportar e importar datos en formato JSON.
Implementar la selección dinámica de bases de datos para backups.
Tecnologías Utilizadas
Node.js: Entorno de ejecución para JavaScript en el servidor.
Express: Framework para crear la API REST.
MongoDB: Base de datos NoSQL.
Docker: Para ejecutar MongoDB en un contenedor.
Mongoose: ODM (Object Data Modeling) para interactuar con MongoDB.
HTML/CSS/JavaScript: Para la interfaz de usuario.







2. Configuración Inicial
2.1. Estructura del Proyecto
La estructura inicial del proyecto es la siguiente:
 
public/index.html: Contiene la interfaz de usuario. 
.env: Archivo de configuración con variables de entorno. 
index.js: Código del servidor  
package.json: Dependencias del proyecto. 
backups/: Directorio para almacenar los archivos de backup.
Exports/: Directorio donde se encuentran las exportaciones

Crear contenedor de mongoDB:
docker run -d --name mongodb-container -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=admin -e MONGO_INITDB_ROOT_PASSWORD=secret mongo:latest
Acceder a El:
docker exec -it mongodb-container mongosh -u admin -p secret
show dbs
Parte 2: Creación de Base de Datos e Inserción de Datos
Paso 2: Conectar y Crear una Base de Datos
Crea un directorio para tu proyecto: 
mkdir mongo-web-app
cd mongo-web-app
npm init -y
npm install express mongoose
Archivo Index.js

Parte 3: Copia de Seguridad y Restauración
Paso 3: Respaldar y Restaurar
1.	Hacer un respaldo: 
o	Usa mongodump desde el contenedor
docker exec mongodb-container mongodump --username admin --password secret --db miBaseDeDatos --out /dump




show collections
db.getUsers()
