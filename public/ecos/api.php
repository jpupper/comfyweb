<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');

// Función para obtener el token de Firebase
function getFirebaseToken() {
    // Credenciales de Firebase
    $firebaseConfig = [
        'apiKey' => 'AIzaSyCIsWviA529QBws1KgnPWuJPhn_nAIAYtI',
        'authDomain' => 'naturaleza-sintetica.firebaseapp.com',
        'projectId' => 'naturaleza-sintetica'
    ];
    
    return $firebaseConfig['apiKey'];
}

// Función para procesar los datos de Firestore y convertirlos a un formato JSON limpio
function processFirestoreData($data) {
    $result = [];
    
    // Si hay documentos en la respuesta
    if (isset($data['documents'])) {
        foreach ($data['documents'] as $document) {
            $docData = [];
            $docId = basename($document['name']);
            
            // Procesar los campos del documento
            if (isset($document['fields'])) {
                foreach ($document['fields'] as $field => $value) {
                    // Extraer el valor real del campo según su tipo
                    $docData[$field] = extractFirestoreValue($value);
                }
            }
            
            $result[$docId] = $docData;
        }
    } 
    // Si es un documento único
    elseif (isset($data['fields'])) {
        foreach ($data['fields'] as $field => $value) {
            $result[$field] = extractFirestoreValue($value);
        }
    }
    // Si hay un error o formato desconocido
    else {
        // Verificar si hay algún error en la respuesta
        if (isset($data['error'])) {
            return ['error' => $data['error']['message'] ?? 'Error desconocido'];
        }
        // Si no hay documentos pero tampoco hay error
        return ['message' => 'No se encontraron datos'];
    }
    
    return $result;
}

// Función para extraer el valor real de un campo de Firestore según su tipo
function extractFirestoreValue($fieldValue) {
    // Determinar el tipo de dato y extraer el valor
    if (isset($fieldValue['stringValue'])) {
        return $fieldValue['stringValue'];
    } elseif (isset($fieldValue['integerValue'])) {
        return (int)$fieldValue['integerValue'];
    } elseif (isset($fieldValue['doubleValue'])) {
        return (float)$fieldValue['doubleValue'];
    } elseif (isset($fieldValue['booleanValue'])) {
        return (bool)$fieldValue['booleanValue'];
    } elseif (isset($fieldValue['nullValue'])) {
        return null;
    } elseif (isset($fieldValue['timestampValue'])) {
        return $fieldValue['timestampValue'];
    } elseif (isset($fieldValue['arrayValue'])) {
        $array = [];
        if (isset($fieldValue['arrayValue']['values'])) {
            foreach ($fieldValue['arrayValue']['values'] as $item) {
                $array[] = extractFirestoreValue($item);
            }
        }
        return $array;
    } elseif (isset($fieldValue['mapValue'])) {
        $map = [];
        if (isset($fieldValue['mapValue']['fields'])) {
            foreach ($fieldValue['mapValue']['fields'] as $key => $value) {
                $map[$key] = extractFirestoreValue($value);
            }
        }
        return $map;
    } elseif (isset($fieldValue['geoPointValue'])) {
        return [
            'latitude' => $fieldValue['geoPointValue']['latitude'],
            'longitude' => $fieldValue['geoPointValue']['longitude']
        ];
    } elseif (isset($fieldValue['referenceValue'])) {
        return $fieldValue['referenceValue'];
    }
    
    // Si no se reconoce el tipo, devolver null
    return null;
}

// Función para obtener datos de Firestore
function getFirestoreData($path = null) {
    $token = getFirebaseToken();
    $projectId = 'naturaleza-sintetica';
    
    // Construir la URL de la API de Firestore
    if ($path) {
        $url = "https://firestore.googleapis.com/v1/projects/{$projectId}/databases/(default)/documents/{$path}?key={$token}";
    } else {
        $url = "https://firestore.googleapis.com/v1/projects/{$projectId}/databases/(default)/documents/artifacts/naturaleza-sintetica/public/data/interactions?key={$token}";
    }
    
    // Inicializar cURL
    $curl = curl_init();
    
    // Configurar opciones de cURL
    curl_setopt_array($curl, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_MAXREDIRS => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_CUSTOMREQUEST => 'GET',
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Content-Type: application/json'
        ],
    ]);
    
    // Ejecutar la solicitud
    $response = curl_exec($curl);
    $err = curl_error($curl);
    
    // Cerrar cURL
    curl_close($curl);
    
    // Manejar errores
    if ($err) {
        return ['error' => "Error de cURL: {$err}"];
    } else {
        // Decodificar la respuesta JSON
        $data = json_decode($response, true);
        
        // Procesar los datos para obtener un formato JSON limpio
        return processFirestoreData($data);
    }
}

// Procesar la solicitud
$path = isset($_GET['path']) ? $_GET['path'] : null;
$result = getFirestoreData($path);

// Devolver la respuesta JSON limpia
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
?>
