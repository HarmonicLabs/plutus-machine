[
  (lam  z_comb
    [
      (lam matchList 
        [
          (lam c 
            (lam d 
              [
                (lam e 
                  (force 
                    [
                      [
                        [
                          (force 
                            (builtin ifThenElse)
                          ) 
                          e
                        ] 
                        (delay 
                          (con unit ())
                        )
                      ] 
                      (delay (error)
                      )
                    ]
                  )
                ) 
                [
                  [
                    (builtin equalsInteger) 
                    [
                      [
                        [
                          (lam e 
                            (lam f 
                              (lam g 
                                [
                                  [
                                    [
                                      c 
                                      (lam h 
                                        (delay 
                                          (con integer 0)
                                        )
                                      )
                                    ] 
                                    (lam h 
                                      (lam i 
                                        (lam l 
                                          (force 
                                            [
                                              [
                                                [
                                                  (force 
                                                    (builtin ifThenElse)
                                                  ) 
                                                  [
                                                    [
                                                      (builtin equalsByteString) 
                                                      [
                                                        (lam m 
                                                          [
                                                            (builtin unBData) 
                                                            [
                                                              (force 
                                                                (force 
                                                                  (builtin fstPair)
                                                                )
                                                              ) 
                                                              m
                                                            ]
                                                          ]
                                                        ) 
                                                        i
                                                      ]
                                                    ] 
                                                    f
                                                  ]
                                                ] 
                                                (delay 
                                                  [
                                                    [
                                                      [
                                                        c 
                                                        (lam m 
                                                          (delay 
                                                            (con integer 0)
                                                          )
                                                        )
                                                      ] 
                                                      (lam m 
                                                        (lam o 
                                                          (lam p 
                                                            (force 
                                                              [
                                                                [
                                                                  [
                                                                    (force 
                                                                      (builtin ifThenElse)
                                                                    ) 
                                                                    [
                                                                      [
                                                                        (builtin equalsByteString) 
                                                                        [
                                                                          (builtin unBData) 
                                                                          [
                                                                            (force 
                                                                              (force 
                                                                                (builtin fstPair)
                                                                              )
                                                                            ) 
                                                                            o
                                                                          ]
                                                                        ]
                                                                      ] 
                                                                      g
                                                                    ]
                                                                  ] 
                                                                  (delay 
                                                                    [
                                                                      (builtin unIData) 
                                                                      [
                                                                        (force 
                                                                          (force 
                                                                            (builtin sndPair)
                                                                          )
                                                                        ) 
                                                                        o
                                                                      ]
                                                                    ]
                                                                  )
                                                                ] 
                                                                (delay 
                                                                  [
                                                                    m 
                                                                    p
                                                                  ]
                                                                )
                                                              ]
                                                            )
                                                          )
                                                        )
                                                      )
                                                    ] 
                                                    [
                                                      (builtin unMapData) 
                                                      [
                                                        (force 
                                                          (force 
                                                            (builtin sndPair)
                                                          )
                                                        ) 
                                                        i
                                                      ]
                                                    ]
                                                  ]
                                                )
                                              ] 
                                              (delay 
                                                [
                                                  h 
                                                  l
                                                ]
                                              )
                                            ]
                                          )
                                        )
                                      )
                                    )
                                  ] 
                                  e
                                ]
                              )
                            )
                          ) 
                          d
                        ] 
                        (con bytestring #00000000000000000000000000000000000000000000000000000000)
                      ] 
                      (con bytestring #0000000000000000000000000000000000000000000000000000000000000000)
                    ]
                  ] 
                  (con integer 42)
                ]
              ]
            )
          ) 
          [
             z_comb 
            (lam c 
              (lam d 
                (lam e 
                  (lam f 
                    [
                      (lam g 
                        [
                          [
                            [
                              matchList 
                              [
                                d 
                                g
                              ]
                            ] 
                            [
                              e 
                              g
                            ]
                          ] 
                          f
                        ]
                      ) 
                      [
                        [
                          c 
                          d
                        ] 
                        e
                      ]
                    ]
                  )
                )
              )
            )
          ]
        ]
      ) 
      (lam matchList 
        (lam c 
          (lam lst 
            (force 
              [
                [
                  [
                    (force 
                      (force 
                        (builtin chooseList)
                      )
                    ) 
                    lst
                  ] 
                  matchList
                ] 
                (delay 
                  [
                    [
                      c 
                      [
                        (force 
                          (builtin headList)
                        ) 
                        lst
                      ]
                    ] 
                    [
                      (force 
                        (builtin tailList)
                      ) 
                      lst
                    ]
                  ]
                )
              ]
            )
          )
        )
      )
    ]
  ) 
  (lam  z_comb 
    [
      (lam matchList 
        [
           z_comb 
          (lam c 
            [
              [
                matchList 
                matchList
              ] 
              c
            ]
          )
        ]
      ) 
      (lam matchList 
        [
           z_comb 
          (lam c 
            [
              [
                matchList 
                matchList
              ] 
              c
            ]
          )
        ]
      )
    ]
  )
]