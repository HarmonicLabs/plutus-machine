-- V4 (1.2.0) Case-over-Const: cons list -> constr 0 [head, tail]
(program 1.2.0
    (case (con (list integer) [10, 20, 30])
        (lam h (lam t h))
        (con integer 0)
    )
)
