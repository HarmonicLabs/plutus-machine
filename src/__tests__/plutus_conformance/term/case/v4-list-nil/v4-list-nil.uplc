-- V4 (1.2.0) Case-over-Const: nil list -> constr 1 [] (no fields)
(program 1.2.0
    (case (con (list integer) [])
        (lam h (lam t (con integer 999)))
        (con integer 0)
    )
)
