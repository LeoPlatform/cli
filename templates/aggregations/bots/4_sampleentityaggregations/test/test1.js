module.exports = {
    Records: [{
        dynamodb: {ApproximateCreationDateTime: 12345},
        eventID: 123,
        eventSourceARN: ":table/abcdefg/stream",
        payload: {
            "id": "OrderV2_entity_changes",
            "event": "OrderV2_changes",
            "payload": {
                "new": {
                    "signature_required_flag": true,
                    "acknowledge_by_date": "2018-07-13T00:01:06+00:00",
                    "invoice_by_date": "2018-07-19T00:01:06+00:00",
                    "channel": "DSCO_5010_All_Cancel",
                    "expected_delivery_date": "2018-07-19T00:01:06+00:00",
                    "last_actor": {
                        "process_id": "p5b469a02794f5490392880",
                        "account_type": null,
                        "account_id": 1000007320,
                        "user_id": null,
                        "job_id": null,
                        "employee_id": null,
                        "ip": null,
                        "mt": 1531353667.462413,
                        "source": "FEED",
                        "trigger": "Internal - OrderController::createEdssAction",
                        "system_op": false,
                        "update_date": "2018-07-12T00:01:18+00:00"
                    },
                    "_dates": {
                        "retailer_create": "2018-07-10T18:01:06-06:00",
                        "cancel_late": "2018-07-13T18:01:06-06:00",
                        "created": "2018-07-11T18:01:07-06:00",
                        "acknowledge_late": "2018-07-12T18:01:06-06:00",
                        "expected_delivery": "2018-07-18T18:01:06-06:00",
                        "invoice_late": "2018-07-18T18:01:06-06:00",
                        "cancel_after": "2018-07-13T18:01:06-06:00",
                        "acknowledge_by": "2018-07-12T18:01:06-06:00",
                        "required_delivery": "2018-07-18T18:01:06-06:00",
                        "last_update": "2018-07-11T18:01:18-06:00",
                        "ship_by": "2018-07-13T18:01:06-06:00",
                        "ship_late": "2018-07-13T18:01:06-06:00",
                        "last_status_update": "2018-07-11T18:01:18-06:00",
                        "invoice_by": "2018-07-18T18:01:06-06:00"
                    },
                    "currency_code": "USD",
                    "ship_by_date": "2018-07-14T00:01:06+00:00",
                    "po_number": "201807111801063",
                    "partition": "OrderV2-5",
                    "required_delivery_date": "2018-07-19T00:01:06+00:00",
                    "shipping": {
                        "country": "US",
                        "address2": "ship_address_2_DSCO_5010",
                        "city": "ship_city_DSCO_5010",
                        "address1": "ship address 1_DSCO_5010",
                        "last_name": "ship_last_DSCO_5010",
                        "phone": "801-123-1234",
                        "store_number": "010",
                        "attention": "ship_attention_DSCO_5010",
                        "company": "ship_company_DSCO_5010",
                        "postal": "84043",
                        "state": "UT",
                        "first_name": "ship_first_DSCO_5010",
                        "email": "travis1_DSCO_5010@dsco.io"
                    },
                    "requested_shipping_service_level_code": "DSCO_5010",
                    "ship_carrier": "FedEx",
                    "retailer_account_id": null,
                    "ship_service_level_code": "DSCO_5010",
                    "ship_method": "SameDay",
                    "id": "1000779005",
                    "test_flag": 0,
                    "create_date": "2018-07-12T00:01:07+00:00",
                    "dsco_ship_carrier": null,
                    "provisional_shipments": [],
                    "days_to_arrive": 1,
                    "consumer_order_number": "12345678901234567890",
                    "required_ship_date": null,
                    "dsco_ship_method": null,
                    "retailer_id": 1000007320,
                    "ship_late_date": "2018-07-14T00:01:06+00:00",
                    "shipments": [],
                    "estimated_ship_date": null,
                    "supplier_order_number": null,
                    "vendor_id": null,
                    "cancel_after_date": "2018-07-14T00:01:06+00:00",
                    "_id": "5b469a4e803983517f8b456a",
                    "dsco_shipping_service_level_code": null,
                    "requested_ship_carrier": "FedEx",
                    "requested_ship_method": "SameDay",
                    "retailer_create_date": "2018-07-11T00:01:06+00:00",
                    "items": [
                        {
                            "sub_statuses": [],
                            "personalization": "personalized for fred DSCO_5010",
                            "quantity": 1,
                            "cost": 49.99,
                            "consumer_price": 89.89,
                            "item_id": 1028734820,
                            "expected_cost": 49.99,
                            "line_number": 1,
                            "warehouse_code": "WHC01_DSCO_5010",
                            "partner_sku": "7216SKU01",
                            "title": "SKU01 title",
                            "sku": "SKU01"
                        },
                        {
                            "sub_statuses": [],
                            "personalization": "personalized for fred2 DSCO_5010",
                            "quantity": 2,
                            "cost": 49.99,
                            "consumer_price": 89.89,
                            "item_id": 1028734820,
                            "expected_cost": 49.99,
                            "line_number": 2,
                            "warehouse_code": "WHC02_DSCO_5010",
                            "partner_sku": "7216SKU01",
                            "title": "SKU01 title",
                            "sku": "SKU01"
                        }
                    ],
                    "order_id": 10780669,
                    "suborder_id": 1000779005,
                    "supplier_id": 1000007321,
                    "retailer_shipping_account": null,
                    "status": "created"
                },
                "old": null
            },
            "event_source_timestamp": 1531416180000,
            "timestamp": 1531416195270,
            "correlation_id": {
                "start": "1162ac0cc1a19028c01ca5299bc46fc7",
                "source": "system:dynamodb.StagingDAD-Entities.OrderV2"
            },
            "eid": "z/2018/07/12/17/23/1531416195236-0000015"
        }
    }]
};