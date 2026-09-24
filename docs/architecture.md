# Diagrama de Arquitetura - Eternal Streams

## Estrutura do Banco de Dados

```mermaid
erDiagram
    CAMERAS ||--o{ VELORIO_CAMERAS : "associada a"
    VELORIOS ||--o{ VELORIO_CAMERAS : "possui"
    
    CAMERAS {
        uuid id PK
        varchar nome
        text rtsp_url
        boolean ativo
        timestamp created_at
        timestamp updated_at
    }
    
    VELORIOS {
        uuid id PK
        varchar nome_falecido
        timestamp data_inicio
        timestamp data_fim
        varchar token_acesso UK "6 chars"
        varchar sala_velorio
        enum status "Agendado|Ao Vivo|Encerrado"
        timestamp created_at
        timestamp updated_at
    }
    
    VELORIO_CAMERAS {
        uuid id PK
        uuid velorio_id FK
        uuid camera_id FK
        integer ordem
        timestamp created_at
    }
```

## Fluxo de Autenticação

```mermaid
sequenceDiagram
    participant U as Usuário Admin
    participant F as Frontend
    participant S as Supabase Auth
    participant D as Database
    
    U->>F: Acessa /admin
    F->>F: Exibe formulário de login
    U->>F: Insere email/senha
    F->>S: signInWithPassword()
    S->>S: Valida credenciais
    alt Credenciais válidas
        S->>F: Retorna session + JWT
        F->>F: Armazena session (localStorage)
        F->>U: Redireciona para /admin/dashboard
        F->>D: Queries com JWT (RLS permite)
    else Credenciais inválidas
        S->>F: Retorna erro
        F->>U: Exibe mensagem de erro
    end
```

## Fluxo de Acesso Público

```mermaid
sequenceDiagram
    participant V as Visitante
    participant F as Frontend
    participant D as Database
    
    V->>F: Acessa / (PublicAccess)
    F->>F: Exibe formulário de token
    V->>F: Insere token (ex: AX9B4Z)
    F->>D: SELECT * FROM velorios WHERE token_acesso = 'AX9B4Z'
    D->>D: RLS permite leitura pública
    alt Token válido
        D->>F: Retorna dados do velório
        F->>F: Valida status e datas
        alt Status = "Ao Vivo"
            F->>V: Redireciona para /velorio/:id
            F->>D: SELECT cameras via velorio_cameras
            D->>F: Retorna câmeras associadas
            F->>V: Exibe transmissão
        else Status = "Agendado" ou "Encerrado"
            F->>V: Exibe mensagem de erro
        end
    else Token inválido
        F->>V: Exibe "Token inválido"
    end
```

## Arquitetura de Componentes

```mermaid
graph TB
    subgraph "Frontend - React"
        A[App.tsx]
        A --> B[Public Routes]
        A --> C[Admin Routes]
        
        B --> D[PublicAccess]
        B --> E[VelorioViewing]
        
        C --> F[AdminLogin]
        C --> G[AdminDashboard]
        C --> H[CameraManagement]
        C --> I[VelorioManagement]
        
        D --> J[useToast]
        E --> J
        F --> K[useAuth]
        G --> L[useVelorios]
        G --> M[useCameras]
        H --> M
        I --> L
        
        K --> N[Supabase Client]
        L --> N
        M --> N
    end
    
    subgraph "Backend - Supabase"
        N --> O[Auth Service]
        N --> P[Database]
        
        P --> Q[cameras table]
        P --> R[velorios table]
        P --> S[velorio_cameras table]
        
        P --> T[RLS Policies]
        P --> U[Functions]
        
        U --> V[generate_unique_token]
        U --> W[update_updated_at]
    end
    
    style A fill:#4CAF50
    style N fill:#FF9800
    style P fill:#2196F3
```

## Row Level Security (RLS) Flow

```mermaid
flowchart TD
    A[Query Request] --> B{User Authenticated?}
    
    B -->|Yes| C[Apply Authenticated Policies]
    B -->|No| D[Apply Public Policies]
    
    C --> E{Operation Type?}
    E -->|SELECT| F[Allow: All rows]
    E -->|INSERT| F
    E -->|UPDATE| F
    E -->|DELETE| F
    
    D --> G{Table?}
    G -->|cameras| H[Allow SELECT: ativo = true]
    G -->|velorios| I[Allow SELECT: All rows]
    G -->|velorio_cameras| I
    
    H --> J[Return Filtered Data]
    I --> J
    F --> K[Return All Data]
    
    G -->|INSERT/UPDATE/DELETE| L[Deny]
    
    style C fill:#4CAF50
    style D fill:#FFC107
    style L fill:#F44336
```

## Fluxo de Gerenciamento de Velórios

```mermaid
stateDiagram-v2
    [*] --> Criacao: Admin cria velório
    
    Criacao --> Agendado: Token gerado automaticamente
    
    Agendado --> AoVivo: data_inicio ≤ NOW()
    Agendado --> Cancelado: Admin cancela
    
    AoVivo --> Encerrado: data_fim ≤ NOW()
    AoVivo --> Cancelado: Admin cancela
    
    Encerrado --> [*]
    Cancelado --> [*]
    
    note right of Criacao
        - generate_unique_token()
        - Associar câmeras
        - Definir datas
    end note
    
    note right of AoVivo
        - Transmissão ativa
        - Acesso público via token
        - Câmeras streaming
    end note
```

## Stack Tecnológico Completo

```mermaid
graph LR
    subgraph "Frontend"
        A[React 18]
        B[TypeScript]
        C[Vite]
        D[Tailwind CSS]
        E[shadcn/ui]
        F[React Router]
        G[TanStack Query]
    end
    
    subgraph "Backend"
        H[Supabase]
        I[PostgreSQL]
        J[PostgREST API]
        K[GoTrue Auth]
    end
    
    subgraph "Infrastructure"
        L[Vercel/Netlify]
        M[Supabase Cloud]
    end
    
    A --> C
    B --> C
    D --> A
    E --> A
    F --> A
    G --> A
    
    G --> J
    A --> K
    
    J --> I
    K --> I
    H --> I
    
    C --> L
    H --> M
    
    style A fill:#61DAFB
    style H fill:#3ECF8E
    style I fill:#336791
```
