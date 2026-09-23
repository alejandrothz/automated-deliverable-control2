// Correo al que llegan los avisos. o grupo de revisores
const CORREO = "adc-revisores@googlegroups.com";

/**
 * Nuevas filas agregadas dia 3
 * se agrega la seguridad
 * 
 * Cambio respecto al Dia 2: la URL sigue siendo publica, pero ahora
 * solo se acepta una peticion que venga con el secreto
 * compartido. Quien no conozca el secreto, no puede escribir.
 */

// el secreto se lle de las propiedades del script.
const SECRET = PropertiesService.getScriptProperties().getProperty("SECRET");

// cuantos segundos se acepta una peticion desde que se firmo
const VENTANA_SEGUNDOS = 300; //5 min


/**
 * doPost una funcion con nombre reservado. Cuando se publica el script
 * cuando alguien envia datos (POST) a la URL de la web app google busca dentro del
 * script una funcion llamada dopost y la ejecuta.
 * 
 * llega una peticion y ejecuta dopost
 */

//la letra e de evento se usa como parametro, es lo que le envia google con la informacion
//donde tambien contiene el contenido.
function doPost(e) {
  //se ejecuta, si algo falla a la mitad, en lugar de detenerse todo
  //pasa al catch para decidir que hacer
  try {
    // el texto llega como JSON y JSON.parse lo convierte a objeto
    const d = JSON.parse(e.postData.contents);

    // proteccion 1: firma
    // se arma la misma cadena que armo quien envio, pegando tres datos con puntos
    const cadena = d.ts + "." + d.generation + "." + d.archivo;

    if (firmar(cadena) !== d.sig) {   //compara el sello actual con el que llego
      console.warn("Firma invalida para: " + d.archivo);
      return texto("firma invalida");
    }

    // proteccion 2: el tiempo
    // evita que copien una peticion valida y la reenvien despues
    const ahora = Date.now() / 1000;
    const segundosTranscurridos = Math.abs(ahora - Number(d.ts));

    if (segundosTranscurridos > VENTANA_SEGUNDOS) {
      console.warn("Peticion expirada: " + d.archivo);
      return texto("peticion expirada");
    }

    // sin nombre de archivo no hay nada que registrar
    if (!d.archivo) {
      return texto("falta el campo archivo");
    }

    // proteccion 3: un escritor a la vez
    // si dos peticiones llegan juntas, las dos leerian la misma
    // ultima fila y generarian el mismo ID
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);   // espera hasta 20 segundos su turno

    // finally se ejecuta siempre, haya error o no,
    // asi el candado nunca se queda puesto bloqueando peticiones
    try {
      const hoja = SpreadsheetApp.getActive().getSheetByName("REGISTRO");

      // proteccion 4: duplicados
      // google entrega los eventos al menos una vez: con un reintento
      // el mismo archivo puede llegar dos veces. el generation es unico,
      // asi que si ya esta en la columna B se descarta
      const columnaB = hoja.getRange("B:B").getValues().join(",");
      if (columnaB.indexOf(d.generation) !== -1) {
        console.log("Duplicado descartado: " + d.archivo);
        return texto("duplicado descartado");
      }

      // identificador legible: ENT- mas el numero de fila que ocupara
      const id = "ENT-" + hoja.getLastRow();

      // escribir la fila, en el orden de los encabezados
      hoja.appendRow([id, String(d.generation), d.archivo, d.tipo || "", d.kb || 0,
      new Date(), d.estado || "PENDIENTE_REVISION", d.motivo || "", "Equipo de revision", "", ""]);

      // un archivo con error se avisa de inmediato
      if (d.estado === "ERROR") {
        GmailApp.sendEmail(CORREO, "Entregable con error: " + d.archivo,
        "Motivo: " + d.motivo + "\nId: " + id);
      }

      return texto("ok " + id);

    } finally {
      lock.releaseLock();   // libera el turno
    }

  } catch (err) {
    // si algo falla, queda registrado en los logs de apps script
    console.error("Error en doPost: " + err);
    return texto("error: " + err);
  }
}
/**
* Devuelve una respuesta de texto simple a quien llamo la web app
* contentservice construye un objeto de respuesta.
*/
function texto(t) {
    return ContentService.createTextOutput(t);
  }

/**
 * DIA 3
 * Calcula el sello de una cadena, usando el secreto compartido.
 * 
 * Ya que el secret noviaja por internet. lo que viaja es el resultado de mezclarlo con el mensaje.
 * y quien recibe hace lo mismo: si coincide todo esta correcto
 */
function firmar(cadena) {
  // computeHmacSha256Signature devuelve bytes
  //base64encode los pasa a texto para poder compararlos y enviarlos.
  return Utilities.base64Encode(Utilities.computeHmacSha256Signature(cadena, SECRET));
}


/**
 * resumen del dia,. la ejecua un acivador por horario.
 * poco despues de la hora limite de entrega
 * 
 * 1. nos cuenta los entregables de hoy por estado.
 * 2. manda un correo con esos numeros.
 * 3. crea un evento en calendar para revisar mañana
 */

function resumenDiario(){
  const hoja = SpreadsheetApp.getActive().getSheetByName("REGISTRO");

  //getDataRange() = todo el rango con datos.
  //ggetValues() lo convierte en una lista de filas; como una matriz
  //slice(1) descarta la primera fila, que son los encabezados.
  const filas = hoja.getDataRange().getValues().slice(1);

  // toDateString() deja solo la fecha, sin la hora
  const hoy = new Date().toDateString();

  let recibidos = 0, errores = 0, pendientes = 0;

  //recorremos fila por fila
  //comparamos que las fechas esten correctas
  for (const f of filas) {
    if (!f[5]) continue;        //si no hay fecha lo salta
    if (new Date(f[5]).toDateString() !== hoy) continue; // si no es de hoy lo salta

    recibidos++;
    if (f[6] === "ERROR") errores++;              //conteo de errores
    if (f[6] === "PENDIENTE_REVISION") pendientes++; //conteo de pendientes
  }
  // eenviamos un correo con los numeros del dia
  GmailApp.sendEmail(CORREO, "Resumen de entregables " + hoy,
  " Recibidos: " + recibidos + "\nPendientes de revision: " + pendientes +
  "\nCon error: " + errores);
  
  //evento en el calendario para que se agregara al dia siguiente

  const maniana = new Date(Date.now() + 86400000) //son los milisegundos que tiene un dia.
  maniana.setHours(9, 0, 0, 0) //9am

  CalendarApp.getDefaultCalendar().createEvent(
    "Revisión de entregables (" + pendientes + " pendientes)",
    maniana,                                          //inicio
    new Date(maniana.getTime() + 3600000));          //finaliza una hora despues

// queda regisrado en ejecuciones, para saer que si corrio
console.log("Resumen enviado: " + recibidos + " recibidos " + pendientes + " pendientes");
}
/**
 * Cierre del ciclo. la ejecuta un activador donde al editar cada vez 
 * que alguien modifica una celda del sheet
 * 
 * se llama alEditar
 */
function alEditar(e){
  //1. filtrar: solo interesa la columna de estado g
  // cualquier otra edicion se ignora y la funcion termina
if(e.range.getColumn() !==7) return;

// solo interesan los dos estados que pone la revisadora.
//los otros dos (pendiente y error) los pone el codigo
// al recibir el archivo, asi que no cierran nada.
if(e.value !== "APROBADO" && e.value !== "REQUIERE_CAMBIOS") return;

const fila = e.range.getRow();    //en que fila ocurra la edicion
const hoja = e.range.getSheet(); 

// escribir la fecha de cierre en la columna k
// getrange(fila, columna) apunta a una celda; setvalue escribe en ella.
// aqui las columnas se cuentan desde 1
hoja.getRange(fila, 11). setValue(new Date());

//leer el id y el archivo par armar un correo 
const id = hoja.getRange(fila,1).getValue();
const archivo = hoja.getRange(fila, 3).getValue();

// avisar el resultado o quien entrego el archivo
GmailApp.sendEmail(CORREO,
"Entregable " + id + ": " + e.value,
"Archivo: " + archivo +
"\nResultado: " + e.value + 
"\nFecha de cierre: " + new Date().toLocaleDateString());

console.log("Ciclo cerrado: " + id + " -> " + e.value);
}
