// Correo al que llegan los avisos. o grupo de revisores
const CORREO = "adc-revisores@googlegroups.com";

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
    const d= JSON.parse(e.postData.contents)

    // valida: sin nombre de archivo no hay nada que registrar
    if(!d.archivo) {
      return texto("falta el cambo archivo");
    }

    const hoja = SpreadsheetApp.getActive().getSheetByName("REGISTRO");

    // identificador legible para cada enregable: ENT- mas el numero de fila que ocupara
    
    const id = "ENT-" + hoja.getLastRow();

    // escribir la fila, en el orden de los encabezados
    hoja.appendRow([id, String(d.generation || ""), d.archivo, d.tipo || "", d.kb || 0,
    new Date(), d.estado || "PENDIENTE_REVISION", d.motivo || "", "Equipo de revision", "", ""]);

    // un archivo con error se avisa de inmediato
    if (d.estado === "ERROR") {
      GmailApp.sendEmail(CORREO, "Entregable con error: " + d.archivo,
      "Motivo: " + d.motivo + "\nId: " + id);

    }

    return texto("ok " + id);

  } catch (err) {
    // si algo falla, queda registrado en los logs de apps script
    console.error("Error en doPost: " + err);
    return texto("error: " + err);
  }
  /**
   * Devuelve una respuesta de texto simple a quien llamo la web app
   * contentservice construye un objeto de respuesta.
   */
  function texto(t) {
    return ContentService.createTextOutput(t);
  }
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
  "\Con error: " + errores);
  
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
const id = hoja.getRange(fila,1).getValues();
const archivo = hoja.getRange(fila, 3).getValue();

// avisar el resultado o quien entrego el archivo
GmailApp.sendEmail(CORREO,
"Entregable " + id + ": " + e.value,
"Archivo: " + archivo +
"\nResultado: " + e.value + 
"\nFecha de cierre: " + new Date().toLocaleDateString());

console.log("Ciclo cerrado: " + id + " -> " + e.value);
}
