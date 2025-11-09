export const salesOrderCreateSchema: any = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "SalesOrderCreatePayload",
  type: "object",
  properties: {
    output: {
      type: "object",
      properties: {
        SalesOrderType: { type: "string" },
        SalesOrganization: { type: "string" },
        DistributionChannel: { type: "string" },
        OrganizationDivision: { type: "string" },
        SoldToParty: { type: "string" },
        PurchaseOrderByCustomer: { type: "string" },
        CustomerPurchaseOrderDate: { type: "string" },
        RequestedDeliveryDate: { type: "string" },
        TransactionCurrency: { type: "string" },
        IncotermsClassification: { type: "string" },
        IncotermsTransferLocation: { type: "string" },
        CustomerPaymentTerms: { type: "string" },
        CustomerPriceGroup: { type: "string" },
        CustomerGroup: { type: "string" },
        SalesDistrict: { type: "string" },
        SDDocumentReason: { type: "string" },
        PricingDate: { type: "string" },
        ShippingCondition: { type: "string" },
        CustomerAccountAssignmentGroup: { type: "string" },
        CustomerPurchaseOrderType: { type: "string" },
        ReferenceSDDocument: { type: "string" },
        ReferenceSDDocumentCategory: { type: "string" },
        SalesOrderDate: { type: "string" },

        to_Partner: {
          type: "array",
          description: "Header Partners",
          items: {
            type: "object",
            properties: {
              PartnerFunction: { type: "string" },
              Customer: { type: "string" },
              Supplier: { type: "string" },
              Personnel: { type: "string" },
              ContactPerson: { type: "string" },
            },
            required: ["PartnerFunction", "Customer"],
            additionalProperties: false,
          },
        },

        to_PricingElement: {
          type: "array",
          description: "Header Pricing Elements",
          items: {
            type: "object",
            properties: {
              PricingProcedureStep: { type: "string" },
              PricingProcedureCounter: { type: "string" },
              ConditionType: { type: "string" },
              ConditionAmount: { type: "number" },
              ConditionCurrency: { type: "string" },
            },
            required: [
              "PricingProcedureStep",
              "PricingProcedureCounter",
              "ConditionAmount"
            ],
            additionalProperties: false,
          },
        },

        to_Item: {
          type: "array",
          description: "Sales Order Items",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              SalesOrderItem: { type: "string" },
              Material: { type: "string" },
              MaterialByCustomer: { type: "string" },
              RequestedQuantity: { type: "number" },
              RequestedQuantityUnit: { type: "string" },
              Batch: { type: "string" },
              Plant: { type: "string" },
              StorageLocation: { type: "string" },
              ShippingPoint: { type: "string" },
              IncotermsClassification: { type: "string" },
              CustomerPaymentTerms: { type: "string" },
              MaterialGroup: { type: "string" },
              ProfitCenter: { type: "string" },
              MaterialPricingGroup: { type: "string" },
              ProductHierarchy: { type: "string" },

              to_ItemPartner: {
                type: "array",
                description: "Item Partners",
                items: {
                  type: "object",
                  properties: {
                    PartnerFunction: { type: "string" },
                    Customer: { type: "string" },
                  },
                  required: ["PartnerFunction", "Customer"],
                  additionalProperties: false,
                },
              },

              to_ItemPricingElement: {
                type: "array",
                description: "Item Pricing Elements",
                items: {
                  type: "object",
                  properties: {
                    PricingProcedureStep: { type: "string" },
                    PricingProcedureCounter: { type: "string" },
                    ConditionType: { type: "string" },
                    ConditionAmount: { type: "number" },
                    ConditionCurrency: { type: "string" },
                  },
                  required: [
                    "PricingProcedureStep",
                    "PricingProcedureCounter",
                    "ConditionAmount"
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["RequestedQuantity"],
            additionalProperties: false,
          },
        },
      },
      required: [
        "SalesOrderType",
        "SalesOrganization",
        "DistributionChannel",
        "OrganizationDivision",
        "SoldToParty",
        "to_Item",
      ],
      additionalProperties: false,
    },
  },
  required: ["output"],
  additionalProperties: false,
};