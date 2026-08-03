#pragma once

// Romu Pseudorandom Number Generators
//
// Copyright 2020 Mark A. Overton
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//     http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// ------------------------------------------------------------------------------------------------
//
// Website: romu-random.org
// Paper:   http://arxiv.org/abs/2002.11331
//
// Copy and paste the generator you want from those below.
// To compile, you will need to #include <stdint.h> and use the ROTL definition below.

#include <cstdint>

//===== RomuQuad ==================================================================================
//
// More robust than anyone could need, but uses more registers than RomuTrio.
// Est. capacity >= 2^90 bytes. Register pressure = 8 (high). State size = 256 bits.

// FORGIVING WITH SEED, SHOULD BE FINE TO SEED WITH ANY NUMBERS, ESPECIALLY IF WARMED BEFORE USE.
class RomuQuadRandom {
public:
    RomuQuadRandom(uint64_t seed[4]);
    void Warm(uint8_t iterations = 10);
    uint64_t Generate();

private:
    uint64_t m_StateW;
    uint64_t m_StateX;
    uint64_t m_StateY;
    uint64_t m_StateZ;
};
