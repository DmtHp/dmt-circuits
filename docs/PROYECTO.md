# Simulador de electrónica con componentes personalizados

Nov 21, 2026 · @dmt

## Resumen

Un simulador de circuitos electrónicos que funciona en el navegador, con un kit básico de componentes y un botón para crear componentes nuevos dentro del mismo espacio de trabajo. Cualquier circuito integrado que no venga incluido se puede describir en un formato abierto y sencillo, generado a mano o con ayuda de una IA, y queda disponible en la biblioteca en minutos.

Es una aplicación web: se abre con un enlace, sin instalar nada, y está pensada para funcionar bien incluso en computadores modestos. El circuito se resuelve con un motor de cálculo propio (análisis nodal), diseñado para responder en tiempo real con circuitos de tamaño académico: decenas o cientos de nodos.

Todo lo que la app muestra es medible y verificable: contra el cálculo a mano, contra el datasheet de cada componente y contra las mediciones del circuito real.

## El problema

Los simuladores accesibles tienen catálogos cerrados, y cuando un trabajo exige un circuito integrado específico, el estudiante no puede probar su diseño antes de montarlo.

- **Catálogo limitado.** Herramientas como Tinkercad traen pocos circuitos integrados. Si el componente no está, no hay forma de agregarlo.
- **Las alternativas son difíciles.** LTspice o ngspice sí aceptan modelos externos, pero exigen conocer SPICE, buscar el modelo del fabricante, editar archivos de texto y entender mensajes de error poco amigables.
- **Sin simulación, se depura a ciegas.** Cuando el circuito montado en protoboard no funciona, no se sabe si el error está en el diseño, en el montaje o en el componente. Se pierde tiempo y material.
- **Agregar un componente no debería requerir programar.** Todo componente electrónico se describe con matemática y lógica. Hoy una IA puede escribir esa descripción en segundos, pero ningún simulador popular está pensado para recibirla de forma fácil.

## La propuesta

La diferencia central es que crear un componente es parte normal del flujo de trabajo, no una tarea avanzada fuera de la app.

- **Un solo botón, sin menús.** "Crear componente" recibe el código pegado o el archivo soltado. La app detecta la categoría y muestra una tarjeta de confirmación ya llena ("Detecté: amplificador operacional, 4 unidades, DIP-14"). Se acepta con un clic.
- **Categorías como reglas por debajo.** Cada categoría (pasivo, diodo, amplificador operacional, compuerta lógica, integrado mixto) define pines mínimos, parámetros obligatorios, rangos válidos y pruebas por defecto. El usuario no la elige: el archivo la declara. El menú de categorías solo aparece al crear un componente a mano o si la categoría no se puede detectar.
- **Formato abierto y declarativo.** Cada componente es un archivo JSON legible, sin código ejecutable. Cualquiera puede escribirlo, compartirlo o pedírselo a una IA.
- **Instrucciones listas para la IA.** La app ofrece un texto con la especificación del formato para copiar en Claude o ChatGPT. Exige la categoría y los datos del datasheet. El usuario pide "genérame el LM324" y pega el resultado.
- **Validación en tres filtros.** Formato, reglas de la categoría y prueba eléctrica. Un archivo que no es un componente (por ejemplo, un script de Python de cuentas) se rechaza con un mensaje claro.
- **La app dibuja el componente.** Con la categoría y los pines genera el símbolo del esquema y el encapsulado físico, por ejemplo el DIP-14 del LM324 con su muesca y pines numerados, como en la protoboard. La IA solo se encarga de lo eléctrico.
- **Todo verificable.** Pruebas contra el datasheet, instrumentos con comportamiento real y comparación con el circuito montado (ver Verificación y medición).
- **Importar modelos SPICE de fabricantes** como meta posterior, para aprovechar los modelos oficiales que publican empresas como Texas Instruments.

## Usuarios objetivo

- **Estudiantes de electrónica** (tecnología, ingeniería) que necesitan probar circuitos de clase con integrados específicos.
- **Docentes** que quieren preparar componentes para sus cursos y compartirlos con el grupo.
- **Aficionados y makers** que trabajan con chips poco comunes y no quieren aprender SPICE.

## Alcance realista

Para una persona trabajando con Claude Code, esto es lo que se puede construir y validar bien en la primera etapa, y lo que queda para después.

| Área | Al alcance ahora | Más adelante |
| --- | --- | --- |
| Pasivos y fuentes | Resistencia, potenciómetro, condensador, bobina, fuentes DC y de señal | Tolerancias y efecto de la temperatura |
| Semiconductores | Diodo, LED y zener con modelo simplificado | Transistores BJT y MOSFET detallados |
| Amplificadores | Op-amps y comparadores con modelo de comportamiento (LM324, LM358, LM741) | Modelos SPICE oficiales de fabricante |
| Digital | Compuertas, flip-flops y contadores simples | Simulación por eventos a gran escala |
| Integrados mixtos | 555 y similares con modelo de comportamiento | Reguladores y temporizadores con más detalle |

Quedan fuera por ahora: microcontroladores (Arduino, ESP32), alta frecuencia, efectos térmicos y una biblioteca del tamaño de la de Proteus. Cada uno es casi un proyecto aparte.

## Cómo funcionaría

El usuario trabaja como en cualquier simulador, y cuando le falta un componente lo crea sin salir del espacio de trabajo.

**Uso normal:** arrastrar componentes del kit al lienzo, cablear, presionar "Simular" y ver voltajes, LEDs y gráficas en tiempo real. Cambiar un valor (por ejemplo, girar un potenciómetro) actualiza el resultado al instante.

**Crear un componente:**

&#91;embedded content: flujo para crear un componente con IA · 5 pasos, 1 validación\]

El botón recibe el archivo sin preguntar nada y lo revisa en tres filtros:

1. **¿Es un archivo del formato?** Un script cualquiera, como un programa de Python de cuentas, se rechaza aquí.
2. **¿Cumple las reglas de su categoría?** Pines mínimos, parámetros obligatorios y rangos válidos (una ganancia negativa o una alimentación de 5000 V no pasan).
3. **¿Se comporta como dice?** Prueba eléctrica automática con los valores del datasheet.

Si algo falla, la app explica el error en lenguaje simple y lo deja listo para copiar a la IA, que corrige el archivo. También se puede crear el componente a mano en el editor; solo ahí aparece el menú de categorías.

## Arquitectura técnica

La app se divide en tres partes independientes: la interfaz, el motor de cálculo y el sistema de componentes. Así el motor se puede probar solo, sin interfaz, y cambiar más adelante sin rehacer todo.

**1. Interfaz (aplicación web)**

- TypeScript + React + Vite, como aplicación web estática. No necesita servidor: se publica gratis (por ejemplo en GitHub Pages) y se comparte con un enlace. Si hace falta, también se puede generar una versión portátil en un solo archivo HTML para abrir sin internet.
- Lienzo de dibujo con SVG o Canvas: colocar componentes, cablear, rotar, borrar, deshacer. Dos vistas de cada componente: símbolo del esquema y encapsulado físico.
- Instrumentos con comportamiento real (voltímetro, amperímetro, LEDs, osciloscopio sencillo), avisos cuando algo supera sus límites y botón "Crear componente" con tarjeta de confirmación.

**2. Motor de cálculo**

- Escrito en TypeScript, sin depender de la interfaz. Corre en un Web Worker para que la pantalla nunca se congele.
- Método: análisis nodal modificado (MNA). Cada componente aporta sus ecuaciones a una matriz y el motor obtiene el voltaje de cada nodo.
- Análisis: punto de operación (DC) y transitorio (en el tiempo). Newton-Raphson para lo no lineal; integración trapezoidal o Euler hacia atrás para condensadores y bobinas.
- Primitivas del motor: resistencia, condensador, bobina, fuentes de voltaje y corriente, diodo, fuentes controladas (VCVS, VCCS) y un limitador suave para saturación. Con estas piezas se arman los componentes complejos.
- **Modelo híbrido.** El motor propio es el modo interactivo, en tiempo real. Más adelante se agrega ngspice compilado a WebAssembly como modo precisión y como referencia para verificar el motor. Se descarga solo cuando el usuario lo activa, para no hacer pesada la carga inicial.
- Si hace falta más velocidad, el núcleo se puede portar a Rust compilado a WebAssembly sin cambiar la interfaz.

**3. Sistema de componentes**

- Formato declarativo en JSON, versionado y validado con un esquema por categoría. Un componente define categoría, metadatos, pines, modelo, nivel de fidelidad y pruebas.
- **Categorías como contratos.** Cada una define pines mínimos, parámetros obligatorios, rangos válidos, símbolo por defecto y pruebas automáticas. Primeras categorías: pasivo, diodo, amplificador operacional y compuerta lógica; luego integrado mixto.
- **Detección automática.** El archivo declara su categoría. Si falta, la app intenta deducirla por los pines y parámetros; si no puede, pregunta.
- El modelo analógico es un subcircuito hecho con las primitivas del motor (macromodelo). El modelo digital es una tabla de verdad o una máquina de estados simple.
- **La app genera lo visual.** El símbolo y el encapsulado salen de la categoría y los pines; la IA no dibuja nada.
- **Seguridad.** El archivo no contiene código ejecutable, así que un archivo generado por IA o descargado de internet no puede ejecutar nada en el navegador. Si se permiten expresiones matemáticas, se interpretan con un analizador propio, nunca con `eval`.

Ejemplo ilustrativo de cómo podría verse un componente (el esquema final se define en la etapa 3):

```json
{
  "formato": "1.0",
  "categoria": "amplificador_operacional",
  "id": "lm324",
  "nombre": "LM324 - Cuatro amplificadores operacionales",
  "encapsulado": "DIP-14",
  "fidelidad": "comportamiento",
  "pines": [
    { "n": 1, "nombre": "OUT1" }, { "n": 2, "nombre": "IN1-" },
    { "n": 3, "nombre": "IN1+" }, { "n": 4, "nombre": "VCC" },
    { "n": 11, "nombre": "GND" }
  ],
  "modelo": {
    "tipo": "subcircuito",
    "bloques": [
      { "usa": "opamp_basico", "pines": ["IN1+", "IN1-", "OUT1", "VCC", "GND"],
        "parametros": { "ganancia": 100000, "gbw_hz": 1000000,
                        "slew_v_us": 0.5, "margen_salida_alto_v": 1.5 } }
    ]
  },
  "pruebas": [
    { "tipo": "seguidor_de_voltaje", "alimentacion_v": 5 },
    { "tipo": "saturacion_salida", "esperado": "VCC - 1.5 V",
      "fuente": "datasheet del fabricante, características eléctricas" }
  ]
}
```

## Rendimiento y optimizaciones

La meta es que la app abra rápido y simule con fluidez en el navegador de cualquier estudiante, incluso en un portátil de gama baja. En el motor, el riesgo real son los bucles de Newton-Raphson que no convergen, no la cantidad de operaciones.

Metas propuestas, a ajustar con mediciones reales: la simulación de un circuito de clase (hasta unos 100 nodos) avanza sin trabarse en un equipo modesto, y la carga inicial no incluye nada que el usuario no esté usando.

| Optimización | Qué resuelve | Etapa |
| --- | --- | --- |
| Matrices dispersas | La matriz está casi llena de ceros; solo se guardan y resuelven los valores útiles | Motor base |
| Reutilizar la factorización | En circuitos lineales con paso fijo, la matriz se factoriza una vez y cada paso es solo sustitución | Motor base |
| Arranque desde la solución anterior | Newton-Raphson converge en 2 a 3 iteraciones en vez de muchas | Motor base |
| Limitar saltos de voltaje en diodos y transistores | Evita que la exponencial del diodo dispare los cálculos | Motor base |
| Plan B de convergencia (conductancia mínima, encendido gradual de fuentes) | Rescata los casos que no convergen en vez de quedarse en bucle | Motor base |
| Límite de iteraciones y aviso al usuario | Nunca hay un bucle infinito; se informa qué nodo falló | Motor base |
| Pruebas de rendimiento automáticas | Detectan cuando un cambio vuelve lenta la simulación | Motor base |
| Paso de tiempo adaptativo | Pasos pequeños solo cuando algo cambia rápido | Transitorio |
| Simulación por eventos para lo digital | Las compuertas se recalculan solo cuando cambia una entrada | Digital |
| Web Worker + presupuesto por cuadro | La interfaz no se congela; cada cuadro avanza solo el tiempo simulado que alcanza | Interfaz |
| Redibujar solo lo que cambió en el lienzo | Fluidez en equipos modestos | Interfaz |
| Carga diferida (ngspice, editor, herramientas pesadas) | La app abre rápido aunque la conexión sea lenta | Interfaz |
| Macromodelos en lugar de transistor por transistor | Un LM324 con pocas ecuaciones en vez de unos 20 transistores por amplificador | Componentes |
| Portar el núcleo a Rust + WebAssembly | Más velocidad si los circuitos crecen | Futuro |

## Verificación y medición

Todo lo que la app muestra debe poder comprobarse, porque los circuitos se terminan construyendo en la vida real. La verificación tiene cuatro niveles.

1. **El motor.** Una colección de circuitos de referencia (divisor, RC, rectificador, op-amp inversor, comparador) con resultados calculados a mano y comparados contra ngspice. Corren automáticamente con cada cambio.
2. **Cada componente.** Sus pruebas usan valores del datasheet con la referencia de dónde salen; por ejemplo, la saturación de salida, el ancho de banda y el slew rate del LM324. La app muestra "Pasa" o "No pasa", y si la IA inventó un parámetro, se nota.
3. **La medición.** Instrumentos con comportamiento real: voltímetro con resistencia interna (unos 10 MΩ), amperímetro en serie, y corriente y potencia visibles en cada componente. Avisos de la vida real, como "este LED recibe 45 mA, en la protoboard se quemaría" o "esta resistencia disipa 0.8 W y es de 1/4 W".
4. **El circuito real (modo laboratorio).** El usuario escribe lo que midió con su multímetro en la protoboard, y la app lo compara nodo por nodo con la simulación: "En el pin 1 esperabas 4.2 V y mediste 0.3 V: revisa la alimentación del pin 4".

Además, cada componente lleva un **sello de fidelidad** (ideal, comportamiento o modelo del fabricante) para saber cuánto confiar en él, y el circuito se puede **exportar a SPICE** para verificarlo en LTspice o ngspice. Los niveles 1 a 3 entran en el MVP; el modo laboratorio, el modo precisión con ngspice y la exportación a SPICE van en la primera etapa después del MVP.

## Alcance de la primera versión (MVP)

La primera versión está lista cuando se puede crear un LM324 con ayuda de una IA, montarlo en un comparador o amplificador y ver resultados correctos en tiempo real.

**Incluye**

- Kit básico: resistencia, potenciómetro, condensador, fuente DC, tierra, diodo, LED, interruptor, op-amp genérico.
- Lienzo para colocar, cablear y editar el circuito, con vista de símbolo y de encapsulado físico.
- Análisis DC y transitorio con el motor propio.
- Instrumentos con comportamiento real (voltímetro, amperímetro, LEDs, gráfica de voltaje en el tiempo) y avisos de límites.
- Botón "Crear componente" de un clic: detección de categoría, tres filtros de validación y tarjeta de confirmación.
- Categorías iniciales: pasivo, diodo, amplificador operacional y compuerta lógica.
- Símbolo y encapsulado generados por la app.
- Pruebas con valores del datasheet y sello de fidelidad en cada componente.
- Texto de instrucciones para pedirle el componente a una IA.
- Guardar y abrir circuitos y componentes (en el navegador y como archivos).
- Publicada como web estática: se abre con un enlace, sin instalar nada.

**Fuera del alcance por ahora**

- Primera etapa después del MVP: modo precisión con ngspice, modo laboratorio y exportación a SPICE.
- Transistores BJT y MOSFET detallados, análisis AC y de frecuencia.
- Importar modelos SPICE de fabricantes.
- Integración directa con una API de IA dentro de la app.
- Cuentas de usuario, nube, colaboración en línea y tienda de componentes.
- Microcontroladores (Arduino, ESP32).

## Riesgos y cómo mitigarlos

El riesgo técnico mayor es la precisión y estabilidad del motor; el riesgo de producto es que la IA genere componentes incorrectos sin que el usuario lo note.

| Riesgo | Mitigación |
| --- | --- |
| El motor da resultados incorrectos | Pruebas automáticas con circuitos de respuesta conocida (divisor, RC, rectificador, op-amp inversor) y comparación con ngspice como referencia |
| Newton-Raphson no converge | Límite de iteraciones, plan B de convergencia y mensaje claro que señala el componente o nodo problemático |
| La IA genera un componente mal hecho o inventa parámetros | Esquema por categoría, mensajes de error entendibles y pruebas contra valores del datasheet antes de agregarlo a la biblioteca |
| Archivos de componentes maliciosos | Formato sin código ejecutable; símbolos dibujados por la app; expresiones interpretadas por un analizador propio |
| La app es lenta en equipos modestos | Web Worker, carga diferida, redibujar solo lo que cambia y pruebas de rendimiento automáticas |
| El proyecto crece demasiado | Avanzar por etapas cerradas; el motor se termina y prueba antes de construir la interfaz completa |
| Proteus y otros programas privados | Se usan solo para estudiar, inspirarse y comparar resultados como usuario. No se descompilan (su licencia lo prohíbe) ni se copia nada de ellos |
| Licencias de código abierto | No copiar código de proyectos GPL (como CircuitJS1) si la app tendrá otra licencia; usarlos solo como referencia de ideas |

## Hoja de ruta

Se trabaja una etapa a la vez, y cada una se cierra solo cuando cumple su criterio de listo.

&#91;embedded content: hoja de ruta · 6 etapas y la puerta del MVP\]

Las etapas 1 y 2 se prueban sin interfaz, con circuitos escritos como texto; así los errores del motor no se confunden con errores de la pantalla.

## Competencia y referencias

Varios simuladores permiten componentes propios, pero ninguno combina un flujo guiado, sin programar, pensado para que una IA genere el componente.

| Herramienta | Qué permite | Qué le falta para este caso |
| --- | --- | --- |
| [Wokwi](https://docs.wokwi.com/chips-api/getting-started) | Chips personalizados creados con un archivo JSON de pines y un archivo de código, normalmente en C o en lenguajes que compilan a WebAssembly; la API sigue en beta | Hay que programar en C; está orientado a microcontroladores y chips digitales |
| [Falstad CircuitJS1](https://lushprojects.com/circuitjs/) | Simulación interactiva en el navegador; sus [subcircuitos](https://deepwiki.com/pfalstad/circuitjs1/4.4-composite-elements) se pueden reimportar como componentes nuevos | El proceso para crear subcircuitos no es evidente para usuarios nuevos; licencia GPLv2 |
| [EEcircuit](https://github.com/eelab-dev/EEcircuit) | ngspice en el navegador vía WebAssembly; todo se procesa localmente | Trabaja con netlists SPICE y apunta a diseño de chips (VLSI), no a estudiantes |
| LTspice, ngspice | Importan modelos SPICE oficiales de fabricantes | Instalación, sintaxis SPICE y depuración poco amigable |
| Tinkercad Circuits | Muy fácil de usar | Catálogo cerrado, sin componentes propios |

**Postura sobre Proteus.** Proteus se usa solo para estudiar y tomar inspiración (cómo organiza su biblioteca, sus instrumentos y su flujo de trabajo) y para comparar resultados armando el mismo circuito en ambos programas. No se descompila ni se copia nada: su [licencia](https://www.scribd.com/document/530023849/Licencing-Agreement) prohíbe la ingeniería inversa, y todo lo del proyecto se construye propio. Su núcleo analógico se basa en [SPICE3F5](https://www.scribd.com/document/345925966/p7brochure-pdf), que es de código abierto; su sucesor, ngspice, sí se puede estudiar libremente.

Referencia técnica recomendada para el motor: el manual de ngspice y textos sobre análisis nodal modificado (MNA). Consultado el 21 de noviembre de 2026.
