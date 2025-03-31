const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const fs = require('fs').promises;
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

// Ruta explícita para la raíz
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Conexión a MongoDB
const mongoUri = `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@localhost:27017/${process.env.MONGO_DB}?authSource=admin`;
mongoose.connect(mongoUri)
  .then(() => console.log('Conectado a MongoDB'))
  .catch(err => console.error('Error:', err));

// Esquema y Modelo para la colección 'items'
const itemSchema = new mongoose.Schema({ nombre: String, valor: Number });
const Item = mongoose.model('Item', itemSchema);

// Rutas para gestionar items
app.get('/items', async (req, res) => {
  try {
    const items = await Item.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/items', async (req, res) => {
  try {
    const item = new Item(req.body);
    await item.save();
    res.json({ message: 'Item creado', item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedItem = await Item.findByIdAndUpdate(id, req.body, { new: true });
    res.json({ message: 'Item actualizado', updatedItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Item.findByIdAndDelete(id);
    res.json({ message: 'Item eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rutas para gestionar bases de datos
app.get('/databases', async (req, res) => {
  try {
    const adminDb = mongoose.connection.db.admin();
    const { databases } = await adminDb.command({ listDatabases: 1 });
    res.json(databases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/databases', async (req, res) => {
  try {
    const { dbName } = req.body;
    if (!dbName) {
      return res.status(400).json({ error: 'Nombre de la base de datos es requerido' });
    }
    const newDb = mongoose.connection.useDb(dbName);
    await newDb.collection('temp_collection').insertOne({ created: true });
    res.json({ message: `Base de datos ${dbName} creada` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/databases/:dbName', async (req, res) => {
  try {
    const { dbName } = req.params;
    await mongoose.connection.useDb(dbName).db.dropDatabase();
    res.json({ message: `Base de datos ${dbName} eliminada` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rutas para gestionar colecciones
app.post('/collections', async (req, res) => {
  try {
    const { collectionName } = req.body;
    await mongoose.connection.createCollection(collectionName);
    res.json({ message: `Colección ${collectionName} creada` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rutas para backups y restauraciones
app.post('/backup', (req, res) => {
  const { backupPath, dbName } = req.body;
  if (!backupPath) {
    return res.status(400).json({ error: 'Ruta del backup es requerida' });
  }
  if (!dbName) {
    return res.status(400).json({ error: 'Nombre de la base de datos es requerido' });
  }
  // Asegurarse de que backupPath termine en .tar.gz
  const backupFile = backupPath.endsWith('.tar.gz') ? backupPath : `${backupPath}.tar.gz`;
  // Limpiar el directorio /dump antes de crear el backup
  exec(`docker exec mongodb-container rm -rf /dump`, (err) => {
    if (err) {
      console.error('Error al limpiar /dump:', err.message);
    }
    // Ejecutar mongodump con la base de datos seleccionada
    exec(`docker exec mongodb-container mongodump --username ${process.env.MONGO_USER} --password ${process.env.MONGO_PASSWORD} --authenticationDatabase admin --db ${dbName} --out /dump`, (err) => {
      if (err) {
        console.error('Error en mongodump:', err.message);
        return res.status(500).json({ error: err.message });
      }
      // Verificar el contenido de /dump
      exec(`docker exec mongodb-container ls /dump`, (err, stdout) => {
        if (err) {
          console.error('Error al listar /dump:', err.message);
          return res.status(500).json({ error: 'Error al verificar el contenido del backup.' });
        }
        const dirName = stdout.trim().split('\n')[0];
        console.log(`Contenido de /dump: ${stdout}`);
        if (dirName !== dbName) {
          console.error(`El directorio creado (${dirName}) no coincide con la base de datos seleccionada (${dbName})`);
          return res.status(500).json({ error: `El directorio creado (${dirName}) no coincide con la base de datos seleccionada (${dbName}).` });
        }
        // Comprimir el directorio /dump en un archivo .tar.gz
        exec(`docker exec mongodb-container tar -zcvf /backup.tar.gz -C /dump .`, (err) => {
          if (err) {
            console.error('Error al comprimir el backup:', err.message);
            return res.status(500).json({ error: `Error al comprimir el backup: ${err.message}` });
          }
          // Copiar el archivo comprimido al host
          exec(`docker cp mongodb-container:/backup.tar.gz ${backupFile}`, (err) => {
            if (err) {
              console.error('Error en docker cp:', err.message);
              return res.status(500).json({ error: err.message });
            }
            // Limpiar los archivos temporales en el contenedor
            exec(`docker exec mongodb-container rm -rf /dump /backup.tar.gz`, (err) => {
              if (err) {
                console.error('Error al limpiar archivos temporales:', err.message);
              }
              res.json({ message: 'Backup creado', path: backupFile });
            });
          });
        });
      });
    });
  });
});

app.post('/restore', async (req, res) => {
  const { backupPath, dbName } = req.body;
  if (!backupPath) {
    return res.status(400).json({ error: 'Ruta del backup es requerida' });
  }
  if (!dbName) {
    return res.status(400).json({ error: 'Nombre de la base de datos destino es requerido' });
  }
  try {
    // Verificar que la ruta exista y sea un archivo
    const stats = await fs.stat(backupPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'La ruta no apunta a un archivo válido. Asegúrate de que sea un archivo .tar.gz.' });
    }
    if (!backupPath.toLowerCase().endsWith('.tar.gz')) {
      return res.status(400).json({ error: 'El archivo debe ser un .tar.gz.' });
    }
  } catch (err) {
    return res.status(400).json({ error: `No se pudo acceder al archivo del backup: ${err.message}. Verifica que la ruta sea correcta y que el archivo exista.` });
  }
  // Limpiar cualquier directorio existente en /restore
  exec(`docker exec mongodb-container rm -rf /restore /backup.tar.gz`, (err) => {
    if (err) {
      console.error('Error al limpiar /restore:', err.message);
    }
    // Copiar el archivo comprimido al contenedor
    exec(`docker cp "${backupPath}" mongodb-container:/backup.tar.gz`, (err) => {
      if (err) {
        console.error('Error en docker cp:', err.message);
        return res.status(500).json({ error: `Error al copiar el archivo: ${err.message}` });
      }
      // Descomprimir el archivo en /restore
      exec(`docker exec mongodb-container tar -zxvf /backup.tar.gz -C /restore`, (err) => {
        if (err) {
          console.error('Error al descomprimir el backup:', err.message);
          return res.status(500).json({ error: `Error al descomprimir el backup: ${err.message}` });
        }
        // Verificar que el directorio descomprimido contenga datos
        exec(`docker exec mongodb-container ls /restore`, (err, stdout) => {
          if (err || !stdout) {
            console.error('Error: No se encontraron datos en el backup descomprimido:', err ? err.message : 'Directorio vacío');
            return res.status(500).json({ error: 'No se encontraron datos en el backup descomprimido.' });
          }
          // Obtener el nombre del directorio dentro de /restore (debería ser el nombre de la base de datos respaldada)
          const sourceDbName = stdout.split('\n')[0];
          if (!sourceDbName) {
            return res.status(500).json({ error: 'No se pudo determinar el nombre de la base de datos en el backup.' });
          }
          // Ejecutar mongorestore
          exec(`docker exec mongodb-container mongorestore --username ${process.env.MONGO_USER} --password ${process.env.MONGO_PASSWORD} --authenticationDatabase admin --db ${dbName} /restore/${sourceDbName}`, (err, stdout, stderr) => {
            if (err) {
              console.error('Error en mongorestore:', stderr);
              return res.status(500).json({ error: `Error en mongorestore: ${stderr}` });
            }
            // Limpiar archivos temporales
            exec(`docker exec mongodb-container rm -rf /restore /backup.tar.gz`, (err) => {
              if (err) {
                console.error('Error al limpiar archivos temporales:', err.message);
              }
              res.json({ message: 'Base de datos restaurada' });
            });
          });
        });
      });
    });
  });
});

// Rutas para exportación e importación
app.get('/export', (req, res) => {
  const exportFile = `export_${Date.now()}.json`;
  const exportCommand = `docker exec mongodb-container mongoexport --username ${process.env.MONGO_USER} --password ${process.env.MONGO_PASSWORD} --authenticationDatabase admin --db ${process.env.MONGO_DB} --collection items --out /${exportFile}`;
  exec(exportCommand, (err, stdout, stderr) => {
    if (err) {
      console.error('Error en mongoexport:', stderr);
      return res.status(500).json({ error: `Error en mongoexport: ${stderr}` });
    }
    exec(`docker cp mongodb-container:/${exportFile} ./exports/${exportFile}`, (err) => {
      if (err) {
        console.error('Error en docker cp:', err.message);
        return res.status(500).json({ error: err.message });
      }
      res.download(`./exports/${exportFile}`);
    });
  });
});

app.post('/import', async (req, res) => {
  const { filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'Ruta del archivo no especificada' });
  }
  try {
    // Verificar que el archivo exista y sea un archivo (no un directorio)
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'La ruta no apunta a un archivo válido. Asegúrate de que sea un archivo JSON y no un directorio.' });
    }
  } catch (err) {
    return res.status(400).json({ error: `No se pudo acceder al archivo: ${err.message}. Verifica que la ruta sea correcta y que el archivo exista.` });
  }
  // Limpiar cualquier archivo o directorio existente en /import.json
  exec(`docker exec mongodb-container rm -rf /import.json`, (err) => {
    if (err) {
      console.error('Error al limpiar /import.json:', err.message);
    }
    // Copiar el archivo al contenedor
    exec(`docker cp "${filePath}" mongodb-container:/import.json`, (err) => {
      if (err) {
        console.error('Error en docker cp:', err.message);
        return res.status(500).json({ error: `Error al copiar el archivo: ${err.message}` });
      }
      // Verificar que /import.json sea un archivo, no un directorio
      exec(`docker exec mongodb-container test -f /import.json`, (err) => {
        if (err) {
          console.error('Error: /import.json no es un archivo:', err.message);
          return res.status(500).json({ error: '/import.json no es un archivo. Asegúrate de que la ruta apunte a un archivo JSON válido.' });
        }
        // Ejecutar mongoimport
        exec(`docker exec mongodb-container mongoimport --username ${process.env.MONGO_USER} --password ${process.env.MONGO_PASSWORD} --authenticationDatabase admin --db ${process.env.MONGO_DB} --collection items --file /import.json`, (err, stdout, stderr) => {
          if (err) {
            console.error('Error en mongoimport:', stderr);
            return res.status(500).json({ error: `Error en mongoimport: ${stderr}` });
          }
          res.json({ message: 'Datos importados' });
        });
      });
    });
  });
});

// Rutas para gestionar usuarios
app.get('/users', async (req, res) => {
  try {
    const users = await mongoose.connection.db.command({ usersInfo: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/users', async (req, res) => {
  try {
    const { username, password, roles, dbName } = req.body;
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ error: 'Debe especificar al menos un rol' });
    }
    const roleObjects = roles.map(role => ({ role, db: dbName }));
    await mongoose.connection.useDb(dbName).db.command({
      createUser: username,
      pwd: password,
      roles: roleObjects
    });
    res.json({ message: `Usuario ${username} creado` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT, () => console.log(`Servidor en puerto ${process.env.PORT}`));