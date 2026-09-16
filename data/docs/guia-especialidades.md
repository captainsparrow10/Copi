# Guía de especialidades médicas

Guía de referencia interna de la aseguradora para orientar al paciente hacia la
especialidad adecuada según el síntoma que describe. La usa el agente Copi a través
de la herramienta `buscar_especialidad` (RAG). **No es un instrumento de diagnóstico**:
solo sugiere a qué especialista conviene acudir primero.

Cada entrada tiene un identificador único `[G-n]` y pertenece a exactamente una
especialidad del catálogo (`especialidades.id`): `medicina_general`, `cardiologia`,
`dermatologia`, `gastroenterologia`, `traumatologia`, `otorrinolaringologia`,
`ginecologia`, `pediatria`.

Cada entrada empieza con la frase coloquial que usaría el paciente ("me duele...",
"tengo...") y luego los términos clínicos equivalentes: la búsqueda semántica
funciona mejor cuando el fragmento se parece a cómo el paciente realmente escribe
el síntoma, no solo a su descripción clínica.

---

### [G-1] medicina_general
Tengo fiebre baja, congestión nasal leve o dolor de garganta desde hace uno o dos
días. Quiero un chequeo por un resfriado común, sin otros síntomas de alarma.

### [G-2] medicina_general
Me duele la cabeza. Dolor de cabeza leve u ocasional, sin señales de alarma.

### [G-3] medicina_general
Tengo gripe: congestión nasal, estornudos, tos leve, dolor muscular.

### [G-4] medicina_general
No sé qué especialista necesito. Quiero una orientación médica inicial o un
chequeo de rutina.

### [G-5] medicina_general
Necesito control de mi hipertensión o diabetes ya diagnosticada, o renovar una
receta médica.

---

### [G-6] cardiologia
Me duele el pecho. Dolor u opresión en el pecho al hacer esfuerzo o al respirar
profundo.

### [G-7] cardiologia
Tengo palpitaciones. El corazón me late muy rápido, muy fuerte o de forma
irregular.

### [G-8] cardiologia
Me falta el aire al subir escaleras o al hacer esfuerzo, de forma progresiva en
los últimos días.

### [G-9] cardiologia
Tengo la presión alta. Me preocupa mi presión arterial o una posible
hipertensión, aunque no me hayan diagnosticado nada todavía. Se me hinchan
las piernas o los tobillos. Quiero una evaluación cardíaca preventiva por la
presión.

### [G-10] cardiologia
Me mareo o me siento fatigado al hacer esfuerzo físico, sin perder el
conocimiento.

---

### [G-11] dermatologia
Tengo manchas, ronchas, erupciones o sarpullido en la piel, con o sin picazón.

### [G-12] dermatologia
Tengo acné. Me salen puntos negros o espinillas inflamadas en la cara o la
espalda.

### [G-13] dermatologia
Se me cambió un lunar de forma, color o tamaño. Me salió una mancha nueva y
sospechosa en la piel.

### [G-14] dermatologia
Se me cae mucho el cabello. Tengo caspa persistente. Se me quiebran las uñas o
tienen manchas.

### [G-15] dermatologia
Tengo la piel seca, escamosa o con picazón crónica: dermatitis, eczema,
psoriasis.

---

### [G-16] gastroenterologia
Me duele el abdomen o el estómago seguido. Tengo acidez o reflujo frecuente
después de comer.

### [G-33] gastroenterologia
Me da acidez y reflujo casi todos los días. Siento ardor que me sube a la
garganta después de comer.

### [G-17] gastroenterologia
Tengo diarrea o estreñimiento desde hace más de una semana.

### [G-18] gastroenterologia
Tengo náuseas frecuentes después de comer, me lleno rápido y he perdido el
apetito.

### [G-19] gastroenterologia
Me duele el estómago después de comidas copiosas o alcohol, de forma repetida.

### [G-20] gastroenterologia
Tengo gastritis o úlcera diagnosticada y los síntomas digestivos me
reaparecen.

---

### [G-21] traumatologia
Me duele la rodilla. Dolor de rodilla al caminar, subir escaleras o cargar
peso. Tengo la rodilla hinchada o con rigidez.

### [G-22] traumatologia
Me duele la espalda o la cintura después de un esfuerzo o de una mala postura.

### [G-23] traumatologia
Me torcí el tobillo o la muñeca. Tuve un golpe reciente en una articulación,
con hinchazón.

### [G-24] traumatologia
Me duele el hombro al levantar el brazo. Siento chasquidos en la articulación.

### [G-25] traumatologia
Tengo un dolor muscular persistente (contractura o tendinitis) que no mejora
con reposo.

---

### [G-26] otorrinolaringologia
Me duele el oído. Siento el oído tapado o con zumbido. Escucho menos que
antes.

### [G-27] otorrinolaringologia
Me duele la garganta y tengo ronquera. Me cuesta tragar, sin ser una
emergencia.

### [G-28] otorrinolaringologia
Tengo congestión nasal crónica, sinusitis a repetición o pérdida del olfato.

---

### [G-29] ginecologia
Tengo un dolor menstrual muy fuerte. Mi ciclo menstrual es irregular. Quiero un
control ginecológico de rutina.

### [G-30] ginecologia
Tengo dolor pélvico o molestia durante las relaciones sexuales. Necesito un
control prenatal.

---

### [G-31] pediatria
Mi hijo o hija tiene fiebre, tos, vómito o diarrea (fuera de las señales de
alarma del Anexo B, que siempre van a emergencias).

### [G-34] pediatria
Mi niña o mi niño está enfermo: mi hija o mi hijo tiene tos, diarrea o vómito
desde ayer y no parece nada grave.

### [G-32] pediatria
Quiero un control de crecimiento y desarrollo infantil o revisar el esquema de
vacunación.
