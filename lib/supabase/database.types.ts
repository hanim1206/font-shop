
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "download_links": {
                  Row: {
                    "created_at": string,"expires_at": string,"id": string,"max_uses": number,"order_no": number,"token_hash": string,"uses": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at": string,"id"?: string,"max_uses"?: number,"order_no": number,"token_hash": string,"uses"?: number
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"id"?: string,"max_uses"?: number,"order_no"?: number,"token_hash"?: string,"uses"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "download_links_order_no_fkey"
      columns: ["order_no"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["order_no"]
    }
                  ]
                },"downloads": {
                  Row: {
                    "at": string,"file_id": string | null,"id": number,"ip": string | null,"link_id": string | null,"order_no": number,"ua": string | null,"via": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"file_id"?: string | null,"id"?: never,"ip"?: string | null,"link_id"?: string | null,"order_no": number,"ua"?: string | null,"via": string
                  }
                  Update: {
                    "at"?: string,"file_id"?: string | null,"id"?: never,"ip"?: string | null,"link_id"?: string | null,"order_no"?: number,"ua"?: string | null,"via"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "downloads_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "order_files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "downloads_link_id_fkey"
      columns: ["link_id"]
isOneToOne: false
      referencedRelation: "download_links"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "downloads_order_no_fkey"
      columns: ["order_no"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["order_no"]
    }
                  ]
                },"emails": {
                  Row: {
                    "created_at": string,"error": string | null,"id": number,"order_no": number | null,"provider_id": string | null,"status": string,"subject": string,"to_email": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"id"?: never,"order_no"?: number | null,"provider_id"?: string | null,"status": string,"subject": string,"to_email": string
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"id"?: never,"order_no"?: number | null,"provider_id"?: string | null,"status"?: string,"subject"?: string,"to_email"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "emails_order_no_fkey"
      columns: ["order_no"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["order_no"]
    }
                  ]
                },"order_events": {
                  Row: {
                    "at": string,"detail": string | null,"event": string,"id": number,"order_no": number
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"detail"?: string | null,"event": string,"id"?: never,"order_no": number
                  }
                  Update: {
                    "at"?: string,"detail"?: string | null,"event"?: string,"id"?: never,"order_no"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_events_order_no_fkey"
      columns: ["order_no"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["order_no"]
    }
                  ]
                },"order_files": {
                  Row: {
                    "bytes": number,"created_at": string,"filename": string,"format": string,"id": string,"order_no": number,"sha256": string,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bytes": number,"created_at"?: string,"filename": string,"format": string,"id"?: string,"order_no": number,"sha256": string,"storage_path": string
                  }
                  Update: {
                    "bytes"?: number,"created_at"?: string,"filename"?: string,"format"?: string,"id"?: string,"order_no"?: number,"sha256"?: string,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_files_order_no_fkey"
      columns: ["order_no"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["order_no"]
    }
                  ]
                },"orders": {
                  Row: {
                    "amount": number,"approved_at": string | null,"created_at": string,"customer_email": string,"eula_agreed_at": string,"failure": Json | null,"font_id": string,"fulfill_started_at": string | null,"fulfilled_at": string | null,"licensee_name": string,"method": string | null,"order_id": string,"order_name": string,"order_no": number,"payment_key": string | null,"product_slug": string,"receipt_url": string | null,"status": Database["public"]['Enums']["order_status"],"updated_at": string,"user_id": string,"withdrawal_waiver_agreed_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"approved_at"?: string | null,"created_at"?: string,"customer_email": string,"eula_agreed_at": string,"failure"?: Json | null,"font_id": string,"fulfill_started_at"?: string | null,"fulfilled_at"?: string | null,"licensee_name": string,"method"?: string | null,"order_id": string,"order_name": string,"order_no"?: never,"payment_key"?: string | null,"product_slug": string,"receipt_url"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"updated_at"?: string,"user_id": string,"withdrawal_waiver_agreed_at": string
                  }
                  Update: {
                    "amount"?: number,"approved_at"?: string | null,"created_at"?: string,"customer_email"?: string,"eula_agreed_at"?: string,"failure"?: Json | null,"font_id"?: string,"fulfill_started_at"?: string | null,"fulfilled_at"?: string | null,"licensee_name"?: string,"method"?: string | null,"order_id"?: string,"order_name"?: string,"order_no"?: never,"payment_key"?: string | null,"product_slug"?: string,"receipt_url"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"updated_at"?: string,"user_id"?: string,"withdrawal_waiver_agreed_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "use_download_link":
{ Args: { "p_token_hash": string }; Returns: {
              "link_id": string,"max_uses": number,"order_no": number,"uses": number
            }[]
                           }
          }
          Enums: {
            "order_status": "READY"|"CONFIRMING"|"PAID"|"FAILED"|"CANCELED"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "order_status": ["READY", "CONFIRMING", "PAID", "FAILED", "CANCELED"]
          }
        }
} as const
